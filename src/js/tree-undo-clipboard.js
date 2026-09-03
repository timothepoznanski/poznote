/**
 * Sidebar tree: undo/redo history and copy/cut/paste clipboard
 *
 * Organizing the tree (moving, deleting, renaming notes and folders) is
 * recorded here so it can be taken back:
 *
 *   Ctrl+Z          undo the last tree change
 *   Ctrl+Shift+Z    redo it (Ctrl+Y works too)
 *   Ctrl+C / X / V  copy, cut and paste the focused note or folder
 *
 * The shortcuts only fire outside text fields and editors, and Ctrl+C/X leave
 * a text selection to the browser, so copying text in a note keeps working.
 * On macOS the Command key replaces Ctrl.
 *
 * Which row the shortcuts act on: the last note or folder row clicked or
 * right-clicked in the tree, falling back to the note that is open. Clicking
 * the empty part of the tree targets the root, so a cut note can be pasted
 * out of every folder. The same actions sit in the row context menus (⋮ or
 * right-click), where paste goes into the folder of the row.
 *
 * Every tree action reloads the page (that is how the existing move, delete
 * and rename flows refresh the tree), so the history and the clipboard live
 * in sessionStorage: they survive the reload and stay private to the tab.
 *
 * History entries are plain objects {type, ...} with one executor per type
 * in EXECUTORS below. Both directions talk to the same REST endpoints the
 * original actions used; deleting a folder is the exception, its undo posts
 * the restore_snapshot that DELETE /api/v1/folders/{id} returned back to
 * POST /api/v1/folders/restore, which rebuilds the subtree and untrashes the
 * notes. Copies are undone by permanently deleting the copy, not by trashing
 * it, so an undone paste leaves nothing behind in the trash.
 *
 * The existing flows call record() once their request succeeded (see
 * js/events-drag-drop.js, js/utils.js, js/notes.js, js/inline-tree-edit.js),
 * reading the "before" state through noteState() / folderState() first.
 */
(function () {
    'use strict';

    var HISTORY_KEY = 'poznote_tree_history';
    var CLIPBOARD_KEY = 'poznote_tree_clipboard';
    var TOAST_KEY = 'poznote_tree_toast';
    var MAX_ENTRIES = 30;

    var isMacPlatform = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');

    // ============================================
    // Helpers
    // ============================================

    function tr(key, fallback, vars) {
        return (typeof window.t === 'function') ? window.t(key, vars || null, fallback) : fallback;
    }

    function currentWorkspace() {
        try {
            if (typeof window.getSelectedWorkspace === 'function') {
                return window.getSelectedWorkspace() || '';
            }
        } catch (e) { }
        return window.selectedWorkspace || '';
    }

    function isReadOnly() {
        return !!(document.body && document.body.classList.contains('public-workspace-readonly'));
    }

    function hasTree() {
        return !!document.getElementById('left_col');
    }

    function readJson(key, fallback) {
        try {
            var raw = sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            if (value === null || value === undefined) {
                sessionStorage.removeItem(key);
            } else {
                sessionStorage.setItem(key, JSON.stringify(value));
            }
        } catch (e) { /* storage unavailable: history is lost on reload, nothing else */ }
    }

    function api(method, url, body) {
        var options = {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin'
        };
        if (body !== undefined) {
            options.body = JSON.stringify(body);
        }
        return fetch(url, options).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (data && data.success) return data;
                var message = (data && (data.error || data.message)) || ('HTTP ' + response.status);
                throw new Error(message);
            });
        });
    }

    // Runs the promise-returning tasks one after the other
    function sequence(items, task) {
        return items.reduce(function (chain, item) {
            return chain.then(function () { return task(item); });
        }, Promise.resolve());
    }

    function encode(value) {
        return encodeURIComponent(value === null || value === undefined ? '' : String(value));
    }

    function sameId(a, b) {
        var left = (a === null || a === undefined || a === '' || a === 0) ? '' : String(a);
        var right = (b === null || b === undefined || b === '' || b === 0) ? '' : String(b);
        return left === right;
    }

    // ============================================
    // Tree lookups
    // ============================================

    function noteLink(noteId) {
        // A favorited note has two rows; prefer the one inside its folder
        var links = document.querySelectorAll('.links_arbo_left[data-note-db-id="' + noteId + '"]');
        for (var i = 0; i < links.length; i++) {
            if (!links[i].closest('.folder-header[data-folder="Favorites"]')) return links[i];
        }
        return links[0] || null;
    }

    function folderHeader(folderId) {
        return document.querySelector('.folder-header[data-folder-id="' + folderId + '"]');
    }

    /** Where a note sits right now (folder and workspace), from its tree row */
    function noteState(noteId) {
        var link = noteLink(noteId);
        return {
            folderId: link ? (link.getAttribute('data-folder-id') || null) : null,
            workspace: currentWorkspace(),
            name: link ? (link.querySelector('.note-title') || link).textContent.trim() : ''
        };
    }

    function siblingFolder(header, direction) {
        var el = header;
        while ((el = direction > 0 ? el.nextElementSibling : el.previousElementSibling)) {
            if (el.classList && el.classList.contains('folder-header') && !el.classList.contains('system-folder')) {
                return el.getAttribute('data-folder-id') || null;
            }
        }
        return null;
    }

    /** Where a folder sits right now: parent, workspace and neighbours (for the order) */
    function folderState(folderId) {
        var header = folderHeader(folderId);
        var parentHeader = header && header.parentElement ? header.parentElement.closest('.folder-header') : null;
        return {
            parentId: parentHeader ? (parentHeader.getAttribute('data-folder-id') || null) : null,
            workspace: currentWorkspace(),
            prevSiblingId: header ? siblingFolder(header, -1) : null,
            nextSiblingId: header ? siblingFolder(header, 1) : null,
            name: header ? (header.getAttribute('data-folder') || '') : ''
        };
    }

    function isFolderInside(folderId, ancestorFolderId) {
        var header = folderHeader(folderId);
        var ancestor = folderHeader(ancestorFolderId);
        return !!(header && ancestor && ancestor !== header && ancestor.contains(header));
    }

    // Shortcuts to a note (type "linked") are trashed along with it; collect
    // them so an undo brings the whole set back
    function linkedNoteIds(noteId) {
        var ids = [];
        document.querySelectorAll('.links_arbo_left[data-note-type="linked"][data-linked-note-id="' + noteId + '"]').forEach(function (link) {
            var id = link.getAttribute('data-note-db-id');
            if (id && ids.indexOf(id) === -1) ids.push(id);
        });
        return ids;
    }

    function openNoteId() {
        var selected = document.querySelector('.links_arbo_left.selected-note');
        if (selected) return selected.getAttribute('data-note-db-id') || null;
        try {
            return new URL(window.location.href).searchParams.get('note');
        } catch (e) {
            return null;
        }
    }

    // ============================================
    // Feedback
    // ============================================

    var toastTimeout = null;

    function toast(message) {
        var existing = document.querySelector('.save-notification[data-tree-toast]');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        if (toastTimeout) clearTimeout(toastTimeout);

        var el = document.createElement('div');
        el.className = 'save-notification';
        el.setAttribute('data-tree-toast', 'true');
        el.innerHTML = '<div class="save-notification-inner"><div class="save-notification-check">✓</div><span></span></div>';
        el.querySelector('span').textContent = message;
        document.body.appendChild(el);

        toastTimeout = setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 2000);
    }

    function errorToast(message) {
        if (typeof window.showNotificationPopup === 'function') {
            window.showNotificationPopup(message, 'error');
        } else {
            alert(message);
        }
    }

    // The page reloads after every tree action, so the confirmation is shown
    // by the next page load
    function toastAfterReload(message) {
        writeJson(TOAST_KEY, message);
    }

    function showPendingToast() {
        var message = readJson(TOAST_KEY, null);
        if (message) {
            writeJson(TOAST_KEY, null);
            toast(message);
        }
    }

    function reloadTree(removedNoteIds) {
        try {
            if (typeof window.persistFolderStatesFromDOM === 'function') window.persistFolderStatesFromDOM();
        } catch (e) { }

        var open = openNoteId();
        var openNoteGone = !!(open && (removedNoteIds || []).some(function (id) { return sameId(id, open); }));
        if (openNoteGone) {
            // Same landing as deleteNote(): the note pane has nothing to show
            try { sessionStorage.removeItem('shouldScrollToNote'); } catch (e) { }
            window.location.href = 'index.php?workspace=' + encode(currentWorkspace());
        } else {
            window.location.reload();
        }
    }

    function rememberFolderOpen(folderId) {
        if (!folderId) return;
        try { localStorage.setItem('folder_folder-' + String(folderId), 'open'); } catch (e) { }
    }

    // ============================================
    // Requests shared by the executors and the clipboard
    // ============================================

    function moveNote(noteId, dest) {
        return api('POST', '/api/v1/notes/' + encode(noteId) + '/folder', {
            folder_id: dest.folderId || '',
            workspace: dest.workspace || currentWorkspace()
        });
    }

    function reorderFolder(folderId, targetFolderId, position, workspace) {
        return api('POST', '/api/v1/folders/reorder', {
            workspace: workspace,
            folder_id: parseInt(folderId, 10),
            target_folder_id: parseInt(targetFolderId, 10),
            position: position
        });
    }

    /**
     * Put a folder back at a recorded place. dest is either a drop beside a
     * folder ({targetFolderId, position}) or a parent plus the neighbours the
     * folder had ({parentId, prevSiblingId, nextSiblingId}); the neighbour
     * restores the order, and is skipped when it no longer exists.
     */
    function placeFolder(folderId, dest) {
        if (dest.targetFolderId && dest.position) {
            return reorderFolder(folderId, dest.targetFolderId, dest.position, dest.workspace);
        }
        return api('POST', '/api/v1/folders/' + encode(folderId) + '/move', {
            workspace: currentWorkspace(),
            target_workspace: dest.workspace,
            new_parent_folder_id: dest.parentId ? parseInt(dest.parentId, 10) : null
        }).then(function () {
            var sibling = dest.prevSiblingId ? { id: dest.prevSiblingId, position: 'after' }
                : (dest.nextSiblingId ? { id: dest.nextSiblingId, position: 'before' } : null);
            if (!sibling) return;
            return reorderFolder(folderId, sibling.id, sibling.position, dest.workspace)
                .catch(function () { /* neighbour gone: the parent is already right */ });
        });
    }

    function permanentlyDeleteNote(noteId, workspace) {
        var url = '/api/v1/notes/' + encode(noteId) + '?permanent=true';
        if (workspace) url += '&workspace=' + encode(workspace);
        return api('DELETE', url);
    }

    function deleteFolderRequest(folderId, workspace) {
        return api('DELETE', '/api/v1/folders/' + encode(folderId) + '?workspace=' + encode(workspace || ''));
    }

    // Delete a folder copy for good: its notes go through the trash on
    // DELETE, so they are wiped afterwards from the snapshot the delete returns
    function destroyFolderCopy(folderId, workspace) {
        return deleteFolderRequest(folderId, workspace).then(function (data) {
            var notes = (data.restore_snapshot && data.restore_snapshot.notes) || [];
            return sequence(notes, function (note) {
                return permanentlyDeleteNote(note.id, workspace).catch(function () { });
            }).then(function () {
                return notes.map(function (note) { return note.id; });
            });
        });
    }

    /**
     * Copy a note into a folder. Same workspace: the duplicate endpoint takes
     * the target folder directly. Other workspace: duplicate next to the
     * original, then move the copy (the move carries the workspace) and try
     * to give it back its plain title, which the unique-title rule may have
     * suffixed while it sat next to the original.
     */
    function duplicateNoteInto(sourceNoteId, sourceWorkspace, dest) {
        var sameWorkspace = !sourceWorkspace || sourceWorkspace === dest.workspace;
        var url = '/api/v1/notes/' + encode(sourceNoteId) + '/duplicate';

        if (sameWorkspace) {
            return api('POST', url, { folder_id: dest.folderId || '', workspace: dest.workspace }).then(function (data) {
                return data.id;
            });
        }

        return api('POST', url, {}).then(function (data) {
            var newId = data.id;
            return moveNote(newId, dest).then(function () {
                if (dest.name) {
                    return api('PATCH', '/api/v1/notes/' + encode(newId), { heading: dest.name }).catch(function () { });
                }
            }).then(function () {
                return newId;
            }, function (error) {
                return permanentlyDeleteNote(newId, sourceWorkspace).catch(function () { }).then(function () {
                    throw error;
                });
            });
        });
    }

    /**
     * Copy a folder tree under a parent. The duplicate endpoint always lands
     * the copy next to the original, so pasting elsewhere is a duplicate plus
     * a move; the copy is then renamed back to the original name when that is
     * free at the destination.
     */
    function duplicateFolderInto(sourceFolderId, sourceWorkspace, dest) {
        var url = '/api/v1/folders/' + encode(sourceFolderId) + '/duplicate?workspace=' + encode(sourceWorkspace || '');

        return api('POST', url, {}).then(function (data) {
            var newId = data.folder_id || (data.folder && data.folder.id);
            var copyParentId = data.folder ? data.folder.parent_id : null;
            var copyWorkspace = (data.folder && data.folder.workspace) || sourceWorkspace;
            var stayed = sameId(copyParentId, dest.parentId) && copyWorkspace === dest.workspace;
            if (stayed) return newId;

            return api('POST', '/api/v1/folders/' + encode(newId) + '/move', {
                workspace: copyWorkspace,
                target_workspace: dest.workspace,
                new_parent_folder_id: dest.parentId ? parseInt(dest.parentId, 10) : null
            }).then(function () {
                if (dest.name) {
                    return api('PATCH', '/api/v1/folders/' + encode(newId), { name: dest.name, workspace: dest.workspace })
                        .catch(function () { });
                }
            }).then(function () {
                return newId;
            }, function (error) {
                return destroyFolderCopy(newId, copyWorkspace).catch(function () { }).then(function () {
                    throw error;
                });
            });
        });
    }

    function editorSessionHeaders() {
        var sessionId = (typeof window.getCurrentEditorSessionId === 'function') ? window.getCurrentEditorSessionId() : '';
        return sessionId ? { 'X-Editor-Session-ID': sessionId } : {};
    }

    function renameNoteRequest(noteId, heading) {
        var headers = editorSessionHeaders();
        return fetch('/api/v1/notes/' + encode(noteId), {
            method: 'PATCH',
            headers: Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, headers),
            credentials: 'same-origin',
            body: JSON.stringify({ heading: heading, editor_session_id: headers['X-Editor-Session-ID'] || '' })
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (data) {
                if (data && data.success) return data;
                throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
            });
        });
    }

    // ============================================
    // History
    // ============================================

    // Each executor receives the entry, may update it (new ids after a redo)
    // and resolves with the ids of the notes it removed from the tree, so the
    // reload can leave a note pane that no longer exists.
    var EXECUTORS = {
        'note-move': {
            label: 'move_note',
            undo: function (e) { return moveNote(e.noteId, e.from).then(function () { return []; }); },
            redo: function (e) { return moveNote(e.noteId, e.to).then(function () { return []; }); }
        },
        'folder-move': {
            label: 'move_folder',
            undo: function (e) { return placeFolder(e.folderId, e.from).then(function () { return []; }); },
            redo: function (e) { return placeFolder(e.folderId, e.to).then(function () { return []; }); }
        },
        'note-delete': {
            label: 'delete_note',
            undo: function (e) {
                var ids = [e.noteId].concat(e.linkedIds || []);
                return sequence(ids, function (id) {
                    var request = api('POST', '/api/v1/notes/' + encode(id) + '/restore', { workspace: e.workspace });
                    // Shortcuts are best effort: the note itself must come back
                    return sameId(id, e.noteId) ? request : request.catch(function () { });
                }).then(function () { return []; });
            },
            redo: function (e) {
                var url = '/api/v1/notes/' + encode(e.noteId) + '?permanent=false&workspace=' + encode(e.workspace || '');
                return api('DELETE', url).then(function () {
                    return [e.noteId].concat(e.linkedIds || []);
                });
            }
        },
        'folder-delete': {
            label: 'delete_folder',
            undo: function (e) {
                return api('POST', '/api/v1/folders/restore', e.snapshot).then(function (data) {
                    e.folderId = data.folder_id || e.folderId;
                    rememberFolderOpen(e.folderId);
                    return [];
                });
            },
            redo: function (e) {
                return deleteFolderRequest(e.folderId, e.snapshot.workspace).then(function (data) {
                    if (data.restore_snapshot) e.snapshot = data.restore_snapshot;
                    return (e.snapshot.notes || []).map(function (note) { return note.id; });
                });
            }
        },
        'note-copy': {
            label: 'paste_note',
            undo: function (e) {
                return permanentlyDeleteNote(e.newNoteId, e.workspace).then(function () { return [e.newNoteId]; });
            },
            redo: function (e) {
                return duplicateNoteInto(e.sourceNoteId, e.sourceWorkspace, {
                    folderId: e.folderId, workspace: e.workspace, name: e.name
                }).then(function (newId) {
                    e.newNoteId = newId;
                    rememberFolderOpen(e.folderId);
                    return [];
                });
            }
        },
        'folder-copy': {
            label: 'paste_folder',
            undo: function (e) { return destroyFolderCopy(e.newFolderId, e.workspace); },
            redo: function (e) {
                return duplicateFolderInto(e.sourceFolderId, e.sourceWorkspace, {
                    parentId: e.parentId, workspace: e.workspace, name: e.name
                }).then(function (newId) {
                    e.newFolderId = newId;
                    rememberFolderOpen(e.parentId);
                    return [];
                });
            }
        },
        'folder-rename': {
            label: 'rename_folder',
            undo: function (e) {
                return api('PATCH', '/api/v1/folders/' + encode(e.folderId), { name: e.from, workspace: e.workspace }).then(function () { return []; });
            },
            redo: function (e) {
                return api('PATCH', '/api/v1/folders/' + encode(e.folderId), { name: e.to, workspace: e.workspace }).then(function () { return []; });
            }
        },
        'note-rename': {
            label: 'rename_note',
            undo: function (e) { return renameNoteRequest(e.noteId, e.from).then(function () { return []; }); },
            redo: function (e) { return renameNoteRequest(e.noteId, e.to).then(function () { return []; }); }
        }
    };

    function loadHistory() {
        var stored = readJson(HISTORY_KEY, null);
        if (!stored || !Array.isArray(stored.undo) || !Array.isArray(stored.redo)) {
            return { undo: [], redo: [] };
        }
        return stored;
    }

    function saveHistory(history) {
        writeJson(HISTORY_KEY, history);
    }

    /** Add a finished tree change to the undo stack (clears the redo stack) */
    function record(entry) {
        if (!entry || !EXECUTORS[entry.type]) return;
        var history = loadHistory();
        history.undo.push(entry);
        if (history.undo.length > MAX_ENTRIES) {
            history.undo.splice(0, history.undo.length - MAX_ENTRIES);
        }
        history.redo = [];
        saveHistory(history);
    }

    function actionLabel(entry) {
        var key = EXECUTORS[entry.type] ? EXECUTORS[entry.type].label : entry.type;
        return tr('tree_history.actions.' + key, key);
    }

    var running = false;

    function step(direction) {
        if (running) return;
        var history = loadHistory();
        var fromStack = direction === 'undo' ? history.undo : history.redo;
        var toStack = direction === 'undo' ? history.redo : history.undo;

        if (!fromStack.length) {
            toast(direction === 'undo'
                ? tr('tree_history.nothing_to_undo', 'Nothing to undo')
                : tr('tree_history.nothing_to_redo', 'Nothing to redo'));
            return;
        }

        var entry = fromStack.pop();
        var executor = EXECUTORS[entry.type];
        if (!executor) {
            saveHistory(history);
            step(direction);
            return;
        }

        running = true;
        executor[direction](entry).then(function (removedNoteIds) {
            toStack.push(entry);
            saveHistory(history);
            toastAfterReload(direction === 'undo'
                ? tr('tree_history.undone', 'Undo: {{action}}', { action: actionLabel(entry) })
                : tr('tree_history.redone', 'Redo: {{action}}', { action: actionLabel(entry) }));
            reloadTree(removedNoteIds || []);
        }).catch(function (error) {
            // Left on its stack: the user can fix the conflict and try again
            running = false;
            errorToast(direction === 'undo'
                ? tr('tree_history.undo_failed', 'Undo failed: {{error}}', { error: error.message })
                : tr('tree_history.redo_failed', 'Redo failed: {{error}}', { error: error.message }));
        });
    }

    // ============================================
    // Clipboard
    // ============================================

    function getClipboard() {
        var item = readJson(CLIPBOARD_KEY, null);
        return (item && item.type && item.id) ? item : null;
    }

    function setClipboard(item) {
        writeJson(CLIPBOARD_KEY, item);
        markCutRows();
    }

    function clearClipboard() {
        setClipboard(null);
    }

    function copyNote(noteId, mode) {
        var state = noteState(noteId);
        setClipboard({
            type: 'note', id: String(noteId), name: state.name, mode: mode,
            workspace: state.workspace, folderId: state.folderId
        });
        toast(mode === 'cut'
            ? tr('tree_clipboard.cut_note', 'Cut "{{name}}"', { name: state.name })
            : tr('tree_clipboard.copied_note', 'Copied "{{name}}"', { name: state.name }));
    }

    function copyFolder(folderId, mode) {
        var state = folderState(folderId);
        setClipboard({
            type: 'folder', id: String(folderId), name: state.name, mode: mode,
            workspace: state.workspace, parentId: state.parentId
        });
        toast(mode === 'cut'
            ? tr('tree_clipboard.cut_folder', 'Cut folder "{{name}}"', { name: state.name })
            : tr('tree_clipboard.copied_folder', 'Copied folder "{{name}}"', { name: state.name }));
    }

    // Dim the rows of a cut item until it is pasted, like a file manager
    function markCutRows() {
        document.querySelectorAll('.tree-clipboard-cut').forEach(function (el) {
            el.classList.remove('tree-clipboard-cut');
        });
        var item = getClipboard();
        if (!item || item.mode !== 'cut' || item.workspace !== currentWorkspace()) return;

        if (item.type === 'note') {
            document.querySelectorAll('.links_arbo_left[data-note-db-id="' + item.id + '"]').forEach(function (link) {
                (link.closest('.note-list-item') || link).classList.add('tree-clipboard-cut');
            });
        } else {
            var header = folderHeader(item.id);
            var toggle = header ? header.querySelector(':scope > .folder-toggle') : null;
            if (toggle) toggle.classList.add('tree-clipboard-cut');
        }
    }

    /**
     * Paste the clipboard into a folder (null for the root of the current
     * workspace). Copies duplicate, cuts move; both are recorded so Ctrl+Z
     * takes them back.
     */
    function paste(targetFolderId) {
        if (isReadOnly() || running) return;
        var item = getClipboard();
        if (!item) {
            toast(tr('tree_clipboard.nothing_to_paste', 'Nothing to paste'));
            return;
        }

        var dest = {
            folderId: targetFolderId || null,
            parentId: targetFolderId || null,
            workspace: currentWorkspace(),
            name: item.name
        };
        var sameWorkspace = item.workspace === dest.workspace;
        var request;

        if (item.type === 'note' && item.mode === 'copy') {
            request = duplicateNoteInto(item.id, item.workspace, dest).then(function (newId) {
                record({
                    type: 'note-copy', sourceNoteId: item.id, sourceWorkspace: item.workspace,
                    newNoteId: newId, folderId: dest.folderId, workspace: dest.workspace, name: item.name
                });
            });
        } else if (item.type === 'note') {
            if (sameWorkspace && sameId(item.folderId, dest.folderId)) {
                toast(tr('tree_clipboard.already_there', 'Already in this folder'));
                return;
            }
            var noteFrom = sameWorkspace ? noteState(item.id) : { folderId: item.folderId, workspace: item.workspace };
            request = moveNote(item.id, dest).then(function () {
                record({
                    type: 'note-move', noteId: item.id,
                    from: { folderId: noteFrom.folderId, workspace: noteFrom.workspace },
                    to: { folderId: dest.folderId, workspace: dest.workspace }
                });
                clearClipboard();
            });
        } else if (item.mode === 'copy') {
            request = duplicateFolderInto(item.id, item.workspace, dest).then(function (newId) {
                record({
                    type: 'folder-copy', sourceFolderId: item.id, sourceWorkspace: item.workspace,
                    newFolderId: newId, parentId: dest.parentId, workspace: dest.workspace, name: item.name
                });
            });
        } else {
            if (sameWorkspace && (sameId(item.id, dest.parentId) || (dest.parentId && isFolderInside(dest.parentId, item.id)))) {
                toast(tr('tree_clipboard.cannot_paste_into_itself', 'A folder cannot be pasted into itself'));
                return;
            }
            if (sameWorkspace && sameId(item.parentId, dest.parentId)) {
                toast(tr('tree_clipboard.already_there', 'Already in this folder'));
                return;
            }
            var folderFrom = sameWorkspace ? folderState(item.id) : { parentId: item.parentId, workspace: item.workspace };
            request = placeFolder(item.id, { parentId: dest.parentId, workspace: dest.workspace }).then(function () {
                record({
                    type: 'folder-move', folderId: item.id,
                    from: {
                        parentId: folderFrom.parentId, workspace: folderFrom.workspace,
                        prevSiblingId: folderFrom.prevSiblingId || null, nextSiblingId: folderFrom.nextSiblingId || null
                    },
                    to: { parentId: dest.parentId, workspace: dest.workspace }
                });
                clearClipboard();
            });
        }

        running = true;
        request.then(function () {
            rememberFolderOpen(dest.folderId);
            toastAfterReload(item.type === 'note'
                ? tr('tree_clipboard.pasted_note', 'Pasted "{{name}}"', { name: item.name })
                : tr('tree_clipboard.pasted_folder', 'Pasted folder "{{name}}"', { name: item.name }));
            reloadTree([]);
        }).catch(function (error) {
            running = false;
            errorToast(tr('tree_clipboard.paste_failed', 'Paste failed: {{error}}', { error: error.message }));
        });
    }

    // ============================================
    // Focused row (keyboard target)
    // ============================================

    var treeFocus = null;

    function noteFocusFromLink(link) {
        return {
            type: 'note',
            id: link.getAttribute('data-note-db-id'),
            folderId: link.getAttribute('data-folder-id') || null,
            linked: link.getAttribute('data-note-type') === 'linked'
        };
    }

    function folderFocusFromHeader(header) {
        return { type: 'folder', id: header.getAttribute('data-folder-id') };
    }

    function trackFocus(event) {
        var target = event.target;
        if (!target || !target.closest || !target.closest('#left_col')) return;
        if (target.closest('.note-actions-menu, .folder-actions-menu, .create-menu')) return;

        // The row holds the link and its ⋮ toggle side by side: a click on
        // either one focuses the note
        var row = target.closest('.note-list-item');
        var link = row ? row.querySelector('.links_arbo_left') : target.closest('.links_arbo_left');
        if (link && link.getAttribute('data-note-db-id')) {
            treeFocus = noteFocusFromLink(link);
            return;
        }

        var header = target.closest('.folder-header');
        if (header && header.getAttribute('data-folder-id') && !header.classList.contains('system-folder')) {
            treeFocus = folderFocusFromHeader(header);
            return;
        }

        if (target.closest('.notes-list-scrollable-content')) {
            treeFocus = { type: 'root' };
        }
    }

    function currentFocus() {
        if (treeFocus) {
            // The row may be gone after a refresh of the tree
            if (treeFocus.type === 'note' && noteLink(treeFocus.id)) return treeFocus;
            if (treeFocus.type === 'folder' && folderHeader(treeFocus.id)) return treeFocus;
            if (treeFocus.type === 'root') return treeFocus;
        }
        var selected = document.querySelector('.links_arbo_left.selected-note');
        return selected ? noteFocusFromLink(selected) : null;
    }

    function pasteTargetFromFocus() {
        var focus = currentFocus();
        if (!focus) return null;
        if (focus.type === 'folder') return focus.id;
        if (focus.type === 'note') return focus.folderId;
        return null;
    }

    // ============================================
    // Keyboard shortcuts
    // ============================================

    function isTextEditingContext(target) {
        return !!(target && target.closest && target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), ' +
            '.CodeMirror, .cm-editor, .excalidraw, .excalidraw-container, canvas'
        ));
    }

    function isModalOpen() {
        var modals = document.querySelectorAll('.modal, .modal-overlay');
        for (var i = 0; i < modals.length; i++) {
            if (window.getComputedStyle(modals[i]).display !== 'none') return true;
        }
        return false;
    }

    function hasTextSelection() {
        var selection = window.getSelection ? window.getSelection() : null;
        return !!(selection && !selection.isCollapsed && String(selection).length > 0);
    }

    function handleKeydown(e) {
        if (e.defaultPrevented) return;
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

        var key = (e.key || '').toLowerCase();
        var isUndo = key === 'z' && !e.shiftKey;
        var isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
        var isCopy = key === 'c' && !e.shiftKey;
        var isCut = key === 'x' && !e.shiftKey;
        var isPaste = key === 'v' && !e.shiftKey;
        if (!(isUndo || isRedo || isCopy || isCut || isPaste)) return;

        if (!hasTree() || isReadOnly()) return;
        if (isTextEditingContext(e.target) || isModalOpen()) return;
        // Copying selected text is the browser's job
        if ((isCopy || isCut) && hasTextSelection()) return;

        if (isUndo || isRedo) {
            e.preventDefault();
            step(isUndo ? 'undo' : 'redo');
            return;
        }

        if (isPaste) {
            if (!getClipboard()) return;
            e.preventDefault();
            paste(pasteTargetFromFocus());
            return;
        }

        var focus = currentFocus();
        if (!focus || focus.type === 'root') return;
        if (focus.type === 'note' && focus.linked && isCopy) return; // a copied shortcut would not point anywhere
        e.preventDefault();
        if (focus.type === 'note') {
            copyNote(focus.id, isCut ? 'cut' : 'copy');
        } else {
            copyFolder(focus.id, isCut ? 'cut' : 'copy');
        }
    }

    // ============================================
    // Context menu items
    // ============================================

    var MENU_ACTIONS = {
        'copy-note': function (item) { copyNote(item.getAttribute('data-note-id'), 'copy'); },
        'cut-note': function (item) { copyNote(item.getAttribute('data-note-id'), 'cut'); },
        'paste-into-note-folder': function (item) { paste(item.getAttribute('data-folder-id') || null); },
        'copy-folder': function (item) { copyFolder(item.getAttribute('data-folder-id'), 'copy'); },
        'cut-folder': function (item) { copyFolder(item.getAttribute('data-folder-id'), 'cut'); },
        'paste-into-folder': function (item) { paste(item.getAttribute('data-folder-id') || null); }
    };

    function handleMenuClick(event) {
        var target = event.target;
        if (!target || !target.closest) return;
        var item = target.closest('.note-actions-menu-item[data-action], .folder-actions-menu-item[data-action]');
        if (!item) return;
        var handler = MENU_ACTIONS[item.getAttribute('data-action')];
        if (!handler) return;

        event.preventDefault();
        event.stopPropagation();
        if (isReadOnly()) return;
        if (typeof window.closeNoteActionsMenu === 'function') window.closeNoteActionsMenu();
        if (typeof window.closeFolderActionsMenu === 'function') window.closeFolderActionsMenu();
        handler(item);
    }

    /**
     * Called by populateNoteActionsMenu / populateFolderActionsMenu (js/utils.js)
     * each time a menu opens: the paste item only makes sense with something
     * on the clipboard, and the shortcut hints follow the platform.
     */
    function syncMenu(menu) {
        if (!menu) return;
        var hasClipboard = !!getClipboard() && !isReadOnly();
        menu.querySelectorAll('[data-action="paste-into-note-folder"], [data-action="paste-into-folder"]').forEach(function (item) {
            item.style.display = hasClipboard ? '' : 'none';
        });
        if (isMacPlatform) {
            menu.querySelectorAll('.actions-menu-shortcut').forEach(function (hint) {
                hint.textContent = hint.textContent.replace(/Ctrl\+/g, '⌘');
            });
        }
        if (typeof window.syncActionsMenuSeparators === 'function') {
            window.syncActionsMenuSeparators(menu);
        }
    }

    // ============================================
    // Wiring
    // ============================================

    function init() {
        if (!hasTree()) return;

        document.addEventListener('keydown', handleKeydown);
        document.addEventListener('mousedown', trackFocus, true);
        document.addEventListener('contextmenu', trackFocus, true);
        document.addEventListener('click', handleMenuClick, true);

        markCutRows();
        showPendingToast();

        // The tree is swapped wholesale by refreshNotesListAfterFolderAction()
        var leftCol = document.getElementById('left_col');
        if (leftCol && window.MutationObserver) {
            new MutationObserver(function () { markCutRows(); }).observe(leftCol, { childList: true });
        }
    }

    window.PoznoteTreeHistory = {
        record: record,
        undo: function () { step('undo'); },
        redo: function () { step('redo'); },
        noteState: noteState,
        folderState: folderState,
        linkedNoteIds: linkedNoteIds
    };

    window.PoznoteTreeClipboard = {
        get: getClipboard,
        clear: clearClipboard,
        copyNote: copyNote,
        copyFolder: copyFolder,
        paste: paste,
        syncMenu: syncMenu
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
