/**
 * Sidebar tree: undo/redo history and copy/cut/paste clipboard
 *
 * Organizing the tree (moving, deleting, renaming notes and folders) is
 * recorded here so it can be taken back:
 *
 *   Ctrl+Z          undo the last tree change
 *   Ctrl+Shift+Z    redo it (Ctrl+Y works too)
 *   Ctrl+C / X / V  copy, cut and paste the selected notes and folders
 *   Del             move them to the trash (Cmd+Backspace on macOS)
 *
 * They only answer while the tree owns the keyboard (js/pane-focus.js): the
 * same keys belong to the note once it has been clicked into, so a Ctrl+Z
 * meant for the text being written never takes a note out of a folder. They
 * also stay out of text fields and editors, and Ctrl+C/X leave a text
 * selection to the browser, so copying text keeps working.
 * On macOS the Command key replaces Ctrl. Dropping a dragged multi-selection
 * (js/events-drag-drop.js) comes through moveItems() and favoriteItems().
 *
 * Which rows the shortcuts act on: the multi-selection built with Ctrl+Click
 * and Shift+Click (js/tree-selection.js) when there is one, otherwise the last
 * note or folder row clicked or right-clicked in the tree, falling back to the
 * note that is open. Del is stricter: without a selection it needs the last
 * click to have been in the tree, so a Del pressed after clicking elsewhere
 * never trashes the open note. Clicking the empty part of the tree targets the
 * root, so a cut note can be pasted out of every folder. The same actions sit
 * in the row context menus (⋮ or right-click), where paste goes into the
 * folder of the row.
 *
 * An action on several rows is recorded as one {type: 'batch', entries}
 * history entry, so a single Ctrl+Z takes the whole set back. When a batch
 * stops halfway, the part that went through and the part that did not are
 * split into two entries so neither is replayed twice.
 *
 * Every tree action reloads the page (that is how the existing move, delete
 * and rename flows refresh the tree), so the history and the clipboard live
 * in sessionStorage: they survive the reload and stay private to the tab. A
 * paste of a single note opens it on the way back, and the others keep what
 * landed selected (#1441).
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
 * js/events-drag-drop.js, the js/utils-*.js set, js/notes.js,
 * js/inline-tree-edit.js),
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
        } catch (e) {
            console.debug('tree-undo-clipboard: currentWorkspace() failed:', e);
        }
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

    function errorToastAfterReload(message) {
        writeJson(TOAST_KEY, { error: message });
    }

    function showPendingToast() {
        var message = readJson(TOAST_KEY, null);
        if (!message) return;
        writeJson(TOAST_KEY, null);
        if (message.error) {
            errorToast(message.error);
        } else {
            toast(message);
        }
    }

    function noteUrl(noteId) {
        if (typeof window.buildNoteNavigationUrl === 'function') {
            return window.buildNoteNavigationUrl(noteId, currentWorkspace());
        }
        return 'index.php?workspace=' + encode(currentWorkspace()) + '&note=' + encode(noteId);
    }

    /**
     * Draw the tree again with what the action changed. showNoteId opens that
     * note on the way, for an action whose result is a note to look at.
     * @param {Array<string|number>} removedNoteIds - Notes the action took away
     * @param {string|number} [showNoteId] - Note to open instead of staying on the current one
     */
    function reloadTree(removedNoteIds, showNoteId) {
        try {
            if (typeof window.persistFolderStatesFromDOM === 'function') window.persistFolderStatesFromDOM();
        } catch (e) {
            console.debug('tree-undo-clipboard: reloadTree() failed:', e);
        }
        writeFoldersToOpen();

        if (showNoteId) {
            window.location.href = noteUrl(showNoteId);
            return;
        }

        var open = openNoteId();
        var openNoteGone = !!(open && (removedNoteIds || []).some(function (id) { return sameId(id, open); }));
        if (openNoteGone) {
            // Same landing as deleteNote(): the note pane has nothing to show
            try { sessionStorage.removeItem('shouldScrollToNote'); } catch (e) {
                console.debug('tree-undo-clipboard: reloadTree() failed:', e);
            }
            window.location.href = 'index.php?workspace=' + encode(currentWorkspace());
        } else {
            window.location.reload();
        }
    }

    var foldersToOpen = [];

    /**
     * Ask for a destination folder to be open on the next page: what just
     * landed there has to be on screen, not folded away (issue #1441). The
     * keys are only written by reloadTree(), because
     * persistFolderStatesFromDOM() runs first there and would otherwise put
     * the closed state straight back over them.
     */
    function rememberFolderOpen(folderId) {
        if (!folderId || foldersToOpen.indexOf(folderId) !== -1) return;
        foldersToOpen.push(folderId);
    }

    // The destination and its ancestors
    function writeFoldersToOpen() {
        foldersToOpen.forEach(function (folderId) {
            if (typeof window.markFolderPathOpen === 'function') {
                window.markFolderPathOpen(folderId);
                return;
            }
            try { localStorage.setItem('folder_folder-' + String(folderId), 'open'); } catch (e) {
                console.debug('tree-undo-clipboard: writeFoldersToOpen() failed:', e);
            }
        });
        foldersToOpen = [];
    }

    // Keep what an action just moved or pasted selected once the page is back
    function rememberSelection(targets) {
        var selection = window.PoznoteTreeSelection;
        if (selection && typeof selection.selectAfterReload === 'function') {
            selection.selectAfterReload(targets);
        }
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

    // The sort mode the tree follows (js/note-sort-cycle.js). Without that
    // module every action keeps the behaviour it had, the one Custom asks for.
    function isManualSort() {
        return typeof window.poznoteNoteSortMode !== 'function' || window.poznoteNoteSortMode() === 'manual';
    }

    /**
     * Put a folder back at a recorded place. dest is either a drop beside a
     * folder ({targetFolderId, position}) or a parent plus the neighbours the
     * folder had ({parentId, prevSiblingId, nextSiblingId}); the neighbour
     * restores the order, and is skipped when it no longer exists.
     *
     * Only the Custom order keeps a place of its own: under any other mode the
     * parent is the whole of it, and asking for the neighbour back would
     * switch the tree to Custom for an undo (#1441).
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
            if (!sibling || !isManualSort()) return;
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
                return permanentlyDeleteNote(note.id, workspace).catch(function (e) {
                    console.debug('tree-undo-clipboard: notes() failed:', e);
                });
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
                    return api('PATCH', '/api/v1/notes/' + encode(newId), { heading: dest.name }).catch(function (e) {
                        console.debug('tree-undo-clipboard: duplicateNoteInto() failed:', e);
                    });
                }
            }).then(function () {
                return newId;
            }, function (error) {
                return permanentlyDeleteNote(newId, sourceWorkspace).catch(function (e) {
                    console.debug('tree-undo-clipboard: duplicateNoteInto() failed:', e);
                }).then(function () {
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
                        .catch(function (e) {
                            console.debug('tree-undo-clipboard: copyWorkspace() failed:', e);
                        });
                }
            }).then(function () {
                return newId;
            }, function (error) {
                return destroyFolderCopy(newId, copyWorkspace).catch(function (e) {
                    console.debug('tree-undo-clipboard: copyWorkspace() failed:', e);
                }).then(function () {
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
                if (data && data.success) {
                    if (typeof window.adoptNoteRename === 'function') {
                        window.adoptNoteRename(noteId, (data.note && data.note.heading) || heading);
                    }
                    return data;
                }
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
                    return sameId(id, e.noteId) ? request : request.catch(function (e) {
                        console.debug('tree-undo-clipboard: renameNoteRequest() failed:', e);
                    });
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

    // Several changes made by one action: a lone change is kept as itself
    function batchEntry(entries) {
        return entries.length === 1 ? entries[0] : { type: 'batch', entries: entries };
    }

    function isValidEntry(entry) {
        if (!entry) return false;
        if (entry.type === 'batch') return Array.isArray(entry.entries) && entry.entries.length > 0;
        return !!EXECUTORS[entry.type];
    }

    /** Add a finished tree change to the undo stack (clears the redo stack) */
    function record(entry) {
        if (!isValidEntry(entry)) return;
        // Organizing the tree is the tree at work, wherever the action was
        // started from: the Ctrl+Z that takes it back comes after the reload
        // it triggers, with nothing clicked since (js/pane-focus.js)
        if (window.PoznotePaneFocus) window.PoznotePaneFocus.set('tree');
        var history = loadHistory();
        history.undo.push(entry);
        if (history.undo.length > MAX_ENTRIES) {
            history.undo.splice(0, history.undo.length - MAX_ENTRIES);
        }
        history.redo = [];
        saveHistory(history);
    }

    function actionLabel(entry) {
        if (entry.type === 'batch') {
            return tr('tree_history.actions.batch', '{{count}} items', { count: entry.entries.length });
        }
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
        if (!isValidEntry(entry)) {
            saveHistory(history);
            step(direction);
            return;
        }

        // A batch is taken back last change first and replayed in its order
        var parts = (entry.type === 'batch' ? entry.entries : [entry]).filter(function (part) {
            return !!EXECUTORS[part.type];
        });
        var ordered = direction === 'undo' ? parts.slice().reverse() : parts.slice();
        var done = [];
        var removedNoteIds = [];

        running = true;
        sequence(ordered, function (part) {
            return EXECUTORS[part.type][direction](part).then(function (removed) {
                done.push(part);
                removedNoteIds = removedNoteIds.concat(removed || []);
            });
        }).then(function () {
            toStack.push(entry);
            saveHistory(history);
            toastAfterReload(direction === 'undo'
                ? tr('tree_history.undone', 'Undo: {{action}}', { action: actionLabel(entry) })
                : tr('tree_history.redone', 'Redo: {{action}}', { action: actionLabel(entry) }));
            reloadTree(removedNoteIds);
        }).catch(function (error) {
            var message = direction === 'undo'
                ? tr('tree_history.undo_failed', 'Undo failed: {{error}}', { error: error.message })
                : tr('tree_history.redo_failed', 'Redo failed: {{error}}', { error: error.message });

            if (!done.length) {
                // Left on its stack: the user can fix the conflict and try again
                running = false;
                errorToast(message);
                return;
            }

            // Part of a batch went through: that part moves across, the rest
            // stays where it was, both in their original order
            fromStack.push(batchEntry(parts.filter(function (part) { return done.indexOf(part) === -1; })));
            toStack.push(batchEntry(parts.filter(function (part) { return done.indexOf(part) !== -1; })));
            saveHistory(history);
            errorToastAfterReload(message);
            reloadTree(removedNoteIds);
        });
    }

    // ============================================
    // Clipboard
    // ============================================

    /**
     * The clipboard is {mode, workspace, items: [{type, id, name, folderId | parentId}]}.
     * A tab still holding the single-item shape of earlier versions
     * ({type, id, mode, ...}) reads as a one-item list.
     */
    function getClipboard() {
        var stored = readJson(CLIPBOARD_KEY, null);
        if (stored && stored.type && stored.id) {
            stored = { mode: stored.mode, workspace: stored.workspace, items: [stored] };
        }
        return (stored && Array.isArray(stored.items) && stored.items.length) ? stored : null;
    }

    function setClipboard(clipboard) {
        writeJson(CLIPBOARD_KEY, clipboard);
        markCutRows();
    }

    function clearClipboard() {
        setClipboard(null);
    }

    /**
     * Drop the targets a folder of the same set already covers: copying,
     * moving or trashing a folder takes its notes and subfolders along, and
     * acting on them a second time would fail or duplicate them.
     */
    function withoutNested(targets) {
        var folderIds = targets.filter(function (t) { return t.type === 'folder'; }).map(function (t) { return String(t.id); });
        return targets.filter(function (target) {
            var element = target.type === 'note' ? noteLink(target.id) : folderHeader(target.id);
            if (!element) return true;
            return !folderIds.some(function (folderId) {
                var ancestor = folderHeader(folderId);
                return !!(ancestor && ancestor.contains(element) && ancestor !== element);
            });
        });
    }

    /**
     * Put notes and folders on the clipboard. targets is [{type, id}] in tree
     * order; shortcuts are left out of a copy, where the duplicate would not
     * point anywhere (same rule as the row menus).
     */
    function copyItems(targets, mode) {
        var items = [];
        withoutNested(targets || []).forEach(function (target) {
            if (target.type === 'note') {
                var link = noteLink(target.id);
                if (mode === 'copy' && link && link.getAttribute('data-note-type') === 'linked') return;
                var note = noteState(target.id);
                items.push({ type: 'note', id: String(target.id), name: note.name, folderId: note.folderId });
            } else if (target.type === 'folder') {
                var folder = folderState(target.id);
                items.push({ type: 'folder', id: String(target.id), name: folder.name, parentId: folder.parentId });
            }
        });
        if (!items.length) return;

        setClipboard({ mode: mode, workspace: currentWorkspace(), items: items });

        if (items.length > 1) {
            toast(mode === 'cut'
                ? tr('tree_clipboard.cut_items', 'Cut {{count}} items', { count: items.length })
                : tr('tree_clipboard.copied_items', 'Copied {{count}} items', { count: items.length }));
            return;
        }
        var item = items[0];
        if (item.type === 'note') {
            toast(mode === 'cut'
                ? tr('tree_clipboard.cut_note', 'Cut "{{name}}"', { name: item.name })
                : tr('tree_clipboard.copied_note', 'Copied "{{name}}"', { name: item.name }));
        } else {
            toast(mode === 'cut'
                ? tr('tree_clipboard.cut_folder', 'Cut folder "{{name}}"', { name: item.name })
                : tr('tree_clipboard.copied_folder', 'Copied folder "{{name}}"', { name: item.name }));
        }
    }

    function copyNote(noteId, mode) {
        copyItems([{ type: 'note', id: noteId }], mode);
    }

    function copyFolder(folderId, mode) {
        copyItems([{ type: 'folder', id: folderId }], mode);
    }

    // Dim the rows of cut items until they are pasted, like a file manager
    function markCutRows() {
        document.querySelectorAll('.tree-clipboard-cut').forEach(function (el) {
            el.classList.remove('tree-clipboard-cut');
        });
        var clipboard = getClipboard();
        if (!clipboard || clipboard.mode !== 'cut' || clipboard.workspace !== currentWorkspace()) return;

        clipboard.items.forEach(function (item) {
            if (item.type === 'note') {
                document.querySelectorAll('.links_arbo_left[data-note-db-id="' + item.id + '"]').forEach(function (link) {
                    (link.closest('.note-list-item') || link).classList.add('tree-clipboard-cut');
                });
            } else {
                var header = folderHeader(item.id);
                var toggle = header ? header.querySelector(':scope > .folder-toggle') : null;
                if (toggle) toggle.classList.add('tree-clipboard-cut');
            }
        });
    }

    /**
     * The request pasting one clipboard item, resolving with its history
     * entry; or {skip: message} when the item has nothing to do there.
     */
    function pasteItem(item, mode, sourceWorkspace, dest) {
        var sameWorkspace = sourceWorkspace === dest.workspace;
        var named = Object.assign({}, dest, { name: item.name });

        if (item.type === 'note' && mode === 'copy') {
            return {
                run: function () {
                    return duplicateNoteInto(item.id, sourceWorkspace, named).then(function (newId) {
                        return {
                            type: 'note-copy', sourceNoteId: item.id, sourceWorkspace: sourceWorkspace,
                            newNoteId: newId, folderId: dest.folderId, workspace: dest.workspace, name: item.name
                        };
                    });
                }
            };
        }

        if (item.type === 'note') {
            if (sameWorkspace && sameId(item.folderId, dest.folderId)) {
                return { skip: tr('tree_clipboard.already_there', 'Already in this folder') };
            }
            return {
                run: function () {
                    var noteFrom = sameWorkspace ? noteState(item.id) : { folderId: item.folderId, workspace: sourceWorkspace };
                    return moveNote(item.id, dest).then(function () {
                        return {
                            type: 'note-move', noteId: item.id,
                            from: { folderId: noteFrom.folderId, workspace: noteFrom.workspace },
                            to: { folderId: dest.folderId, workspace: dest.workspace }
                        };
                    });
                }
            };
        }

        if (mode === 'copy') {
            return {
                run: function () {
                    return duplicateFolderInto(item.id, sourceWorkspace, named).then(function (newId) {
                        return {
                            type: 'folder-copy', sourceFolderId: item.id, sourceWorkspace: sourceWorkspace,
                            newFolderId: newId, parentId: dest.parentId, workspace: dest.workspace, name: item.name
                        };
                    });
                }
            };
        }

        if (sameWorkspace && (sameId(item.id, dest.parentId) || (dest.parentId && isFolderInside(dest.parentId, item.id)))) {
            return { skip: tr('tree_clipboard.cannot_paste_into_itself', 'A folder cannot be pasted into itself') };
        }
        if (sameWorkspace && sameId(item.parentId, dest.parentId)) {
            return { skip: tr('tree_clipboard.already_there', 'Already in this folder') };
        }
        return {
            run: function () {
                var folderFrom = sameWorkspace ? folderState(item.id) : { parentId: item.parentId, workspace: sourceWorkspace };
                return placeFolder(item.id, { parentId: dest.parentId, workspace: dest.workspace }).then(function () {
                    return {
                        type: 'folder-move', folderId: item.id,
                        from: {
                            parentId: folderFrom.parentId, workspace: folderFrom.workspace,
                            prevSiblingId: folderFrom.prevSiblingId || null, nextSiblingId: folderFrom.nextSiblingId || null
                        },
                        to: { parentId: dest.parentId, workspace: dest.workspace }
                    };
                });
            }
        };
    }

    /** What the paste put in the destination: the copies, or the items a cut moved */
    function pastedTargets(entries) {
        return entries.map(function (entry) {
            if (entry.type === 'note-copy') return { type: 'note', id: entry.newNoteId };
            if (entry.type === 'folder-copy') return { type: 'folder', id: entry.newFolderId };
            if (entry.type === 'note-move') return { type: 'note', id: entry.noteId };
            if (entry.type === 'folder-move') return { type: 'folder', id: entry.folderId };
            return null;
        }).filter(Boolean);
    }

    /**
     * The note a paste ends on, when it pasted a single one. It opens rather
     * than the tree keeping the note that was being read, so one row is the
     * current one instead of two, the row that landed tinted as selected next
     * to the open note in its own colour (#1441). Several items, or a folder,
     * have nothing to open and keep the selection instead.
     */
    function singlePastedNote(targets) {
        return (targets.length === 1 && targets[0].type === 'note' && targets[0].id) ? targets[0].id : null;
    }

    /**
     * Paste the clipboard into a folder (null for the root of the current
     * workspace). Copies duplicate, cuts move; the items go one after the
     * other and are recorded as one history entry so Ctrl+Z takes them all
     * back. The clipboard is consumed once anything was pasted.
     */
    function paste(targetFolderId) {
        if (isReadOnly() || running) return;
        var clipboard = getClipboard();
        if (!clipboard) {
            toast(tr('tree_clipboard.nothing_to_paste', 'Nothing to paste'));
            return;
        }

        var dest = {
            folderId: targetFolderId || null,
            parentId: targetFolderId || null,
            workspace: currentWorkspace()
        };

        var skipMessage = null;
        var jobs = [];
        clipboard.items.forEach(function (item) {
            var job = pasteItem(item, clipboard.mode, clipboard.workspace, dest);
            if (job.skip) {
                skipMessage = job.skip;
            } else {
                jobs.push(job);
            }
        });
        if (!jobs.length) {
            toast(skipMessage);
            return;
        }

        var entries = [];
        running = true;
        sequence(jobs, function (job) {
            return job.run().then(function (entry) { entries.push(entry); });
        }).then(function () {
            record(batchEntry(entries));
            // Paste is a one-time action: consume the clipboard so a stale
            // Copy/Cut cannot be pasted again later by accident
            clearClipboard();
            rememberFolderOpen(dest.folderId);
            var pasted = pastedTargets(entries);
            var noteToOpen = singlePastedNote(pasted);
            if (!noteToOpen) rememberSelection(pasted);
            var items = clipboard.items;
            if (items.length > 1) {
                toastAfterReload(tr('tree_clipboard.pasted_items', 'Pasted {{count}} items', { count: entries.length }));
            } else {
                toastAfterReload(items[0].type === 'note'
                    ? tr('tree_clipboard.pasted_note', 'Pasted "{{name}}"', { name: items[0].name })
                    : tr('tree_clipboard.pasted_folder', 'Pasted folder "{{name}}"', { name: items[0].name }));
            }
            reloadTree([], noteToOpen);
        }).catch(function (error) {
            var message = tr('tree_clipboard.paste_failed', 'Paste failed: {{error}}', { error: error.message });
            if (!entries.length) {
                running = false;
                errorToast(message);
                return;
            }
            // Some items landed: keep them undoable, and show the tree they changed
            record(batchEntry(entries));
            clearClipboard();
            rememberFolderOpen(dest.folderId);
            var landed = pastedTargets(entries);
            var openAfterError = singlePastedNote(landed);
            if (!openAfterError) rememberSelection(landed);
            errorToastAfterReload(message);
            reloadTree([], openAfterError);
        });
    }

    // ============================================
    // Drop of a dragged multi-selection (js/events-drag-drop.js)
    // ============================================

    function reorderNoteRequest(noteId, targetNoteId, position, workspace) {
        return api('POST', '/api/v1/notes/reorder', {
            workspace: workspace,
            note_id: parseInt(noteId, 10),
            target_note_id: parseInt(targetNoteId, 10),
            position: position
        });
    }

    /**
     * Move dropped notes and folders. dest.folderId is the folder they land
     * in (null for the root of the current workspace). With dest.targetNoteId
     * and dest.position the notes line up before or after that row instead,
     * in tree order, and only the folders go into dest.folderId. Items
     * already there are skipped; the rest go one after the other and are
     * recorded as one history entry. A pure change of position is not
     * recorded, like a single dragged note.
     */
    function moveItems(targets, dest) {
        if (isReadOnly() || running) return;
        var workspace = currentWorkspace();
        var folderId = dest && dest.folderId ? String(dest.folderId) : null;
        var beside = dest && dest.targetNoteId
            ? { noteId: String(dest.targetNoteId), position: dest.position === 'after' ? 'after' : 'before' }
            : null;

        var items = withoutNested(targets || []);
        var skipMessage = null;
        var jobs = [];

        items.forEach(function (item) {
            if (item.type !== 'folder') return;
            if (sameId(item.id, folderId) || (folderId && isFolderInside(folderId, item.id))) {
                skipMessage = tr('tree_selection.cannot_move_into_itself', 'A folder cannot be moved into itself');
                return;
            }
            var from = folderState(item.id);
            if (sameId(from.parentId, folderId)) {
                skipMessage = tr('tree_clipboard.already_there', 'Already in this folder');
                return;
            }
            jobs.push(function () {
                return placeFolder(item.id, { parentId: folderId, workspace: workspace }).then(function () {
                    return {
                        type: 'folder-move', folderId: String(item.id),
                        from: {
                            parentId: from.parentId, workspace: workspace,
                            prevSiblingId: from.prevSiblingId || null, nextSiblingId: from.nextSiblingId || null
                        },
                        to: { parentId: folderId, workspace: workspace }
                    };
                });
            });
        });

        // Before the target the notes go in one at a time, each right ahead
        // of it; after the target the set is walked backwards, so the tree
        // order comes out the same either way
        var notes = items.filter(function (item) { return item.type === 'note'; });
        if (beside && beside.position === 'after') notes.reverse();
        notes.forEach(function (item) {
            var from = noteState(item.id);
            var changesFolder = !sameId(from.folderId, folderId);
            if (!beside && !changesFolder) {
                skipMessage = tr('tree_clipboard.already_there', 'Already in this folder');
                return;
            }
            var entry = changesFolder ? {
                type: 'note-move', noteId: String(item.id),
                from: { folderId: from.folderId, workspace: workspace },
                to: { folderId: folderId, workspace: workspace }
            } : null;
            jobs.push(function () {
                var request = beside
                    ? reorderNoteRequest(item.id, beside.noteId, beside.position, workspace)
                    : moveNote(item.id, { folderId: folderId, workspace: workspace });
                return request.then(function () { return entry; });
            });
        });

        if (!jobs.length) {
            if (skipMessage) toast(skipMessage);
            return;
        }

        var entries = [];
        var done = 0;
        var finish = function (errorMessage) {
            if (entries.length) record(batchEntry(entries));
            rememberFolderOpen(folderId);
            rememberSelection(items);
            if (errorMessage) {
                errorToastAfterReload(errorMessage);
            } else {
                toastAfterReload(tr('tree_selection.moved_items', 'Moved {{count}} items', { count: done }));
            }
            reloadTree([]);
        };

        running = true;
        sequence(jobs, function (job) {
            return job().then(function (entry) {
                done++;
                if (entry) entries.push(entry);
            });
        }).then(function () {
            finish(null);
        }).catch(function (error) {
            var message = tr('tree_selection.move_failed', 'Move failed: {{error}}', { error: error.message });
            if (!done) {
                running = false;
                errorToast(message);
                return;
            }
            // Some items landed: keep them undoable, and show the tree they changed
            finish(message);
        });
    }

    /**
     * Add dropped notes and folders to the favorites. The note endpoint
     * toggles, so notes the Favorites section already lists are left alone;
     * folders are set outright.
     */
    function favoriteItems(targets) {
        if (isReadOnly() || running) return;
        var workspace = currentWorkspace();
        var jobs = [];

        (targets || []).forEach(function (item) {
            if (item.type === 'note') {
                if (document.querySelector('.folder-header[data-folder="Favorites"] .links_arbo_left[data-note-db-id="' + item.id + '"]')) return;
                jobs.push(function () {
                    return api('POST', '/api/v1/notes/' + encode(item.id) + '/favorite?workspace=' + encode(workspace), { workspace: workspace });
                });
            } else if (item.type === 'folder') {
                var toggle = document.querySelector('.folder-actions-toggle[data-folder-id="' + item.id + '"]');
                if (toggle && toggle.getAttribute('data-favorite') === '1') return;
                jobs.push(function () {
                    return api('PUT', '/api/v1/folders/' + encode(item.id) + '/favorite', { favorite: true });
                });
            }
        });

        if (!jobs.length) {
            toast(tr('tree_selection.already_favorites', 'Already in favorites'));
            return;
        }

        var done = 0;
        running = true;
        sequence(jobs, function (job) {
            return job().then(function () { done++; });
        }).then(function () {
            rememberFolderOpen('favorites');
            toastAfterReload(tr('tree_selection.favorited_items', 'Added {{count}} items to favorites', { count: done }));
            reloadTree([]);
        }).catch(function (error) {
            var message = tr('tree_selection.favorite_failed', 'Could not update favorites: {{error}}', { error: error.message });
            if (!done) {
                running = false;
                errorToast(message);
                return;
            }
            rememberFolderOpen('favorites');
            errorToastAfterReload(message);
            reloadTree([]);
        });
    }

    // ============================================
    // Delete
    // ============================================

    function trashNote(noteId, workspace) {
        var linkedIds = linkedNoteIds(noteId);
        var url = '/api/v1/notes/' + encode(noteId) + '?permanent=false&workspace=' + encode(workspace);
        return api('DELETE', url).then(function () {
            return {
                entry: { type: 'note-delete', noteId: String(noteId), linkedIds: linkedIds, workspace: workspace },
                removed: [String(noteId)].concat(linkedIds)
            };
        });
    }

    function trashFolder(folderId, workspace) {
        return deleteFolderRequest(folderId, workspace).then(function (data) {
            var snapshot = data.restore_snapshot || null;
            return {
                entry: snapshot ? { type: 'folder-delete', folderId: String(folderId), snapshot: snapshot } : null,
                removed: ((snapshot && snapshot.notes) || []).map(function (note) { return String(note.id); })
            };
        });
    }

    function afterNotesTrashed(noteIds) {
        noteIds.forEach(function (noteId) {
            if (typeof window.invalidateNoteDomCache === 'function') window.invalidateNoteDomCache(noteId);
            if (window.tabManager && typeof window.tabManager.closeTabByNoteId === 'function') {
                window.tabManager.closeTabByNoteId(noteId);
            }
        });
        if (noteIds.length && window.POZNOTE_CONFIG && window.POZNOTE_CONFIG.gitSyncAutoPush && typeof window.setNeedsAutoPush === 'function') {
            window.setNeedsAutoPush(true);
        }
    }

    /**
     * Move notes and folders to the trash. One row goes through the same flow
     * as its menu's Delete item (shortcut dialog for a shortcut, content
     * warning for a non-empty folder); several rows ask once, then go one
     * after the other and are recorded as one history entry.
     */
    function deleteItems(targets) {
        if (isReadOnly() || running) return;
        targets = withoutNested(targets || []).filter(function (target) {
            return target.type === 'note' ? !!noteLink(target.id) : !!folderHeader(target.id);
        });

        // A shortcut goes to the trash with its note: trashing it on its own
        // first would leave nothing for the note's delete to take along
        var noteIds = targets.filter(function (t) { return t.type === 'note'; }).map(function (t) { return String(t.id); });
        targets = targets.filter(function (target) {
            if (target.type !== 'note') return true;
            var link = noteLink(target.id);
            var linkedTo = link && link.getAttribute('data-note-type') === 'linked' ? link.getAttribute('data-linked-note-id') : null;
            return !(linkedTo && noteIds.indexOf(String(linkedTo)) !== -1);
        });
        if (!targets.length) return;

        if (targets.length === 1) {
            var single = targets[0];
            if (single.type === 'note') {
                if (typeof window.deleteNote === 'function') window.deleteNote(single.id);
            } else if (typeof window.deleteFolder === 'function') {
                window.deleteFolder(single.id, folderState(single.id).name);
            }
            return;
        }

        var run = function () { runDelete(targets); };
        var message = deleteConfirmMessage(targets);
        if (typeof window.showConfirmModal !== 'function') {
            if (window.confirm(message)) run();
            return;
        }
        window.showConfirmModal(
            tr('tree_selection.delete_title', 'Delete {{count}} items', { count: targets.length }),
            message,
            run,
            { confirmText: tr('common.delete', 'Delete'), danger: true, hideSaveAndExit: true }
        );
    }

    function deleteConfirmMessage(targets) {
        var count = targets.length;
        var hasFolder = targets.some(function (target) { return target.type === 'folder'; });
        var message = hasFolder
            ? tr('tree_selection.delete_message',
                '{{count}} items will be moved to the trash, notes inside the selected folders included. Ctrl+Z brings them back.',
                { count: count })
            : tr('tree_selection.delete_message_notes',
                '{{count}} notes will be moved to the trash. Ctrl+Z brings them back.',
                { count: count });
        return isMacPlatform ? message.replace(/Ctrl\+/g, '⌘') : message;
    }

    function runDelete(targets) {
        if (running) return;
        var workspace = currentWorkspace();
        var entries = [];
        var removed = [];

        running = true;
        sequence(targets, function (target) {
            var request = target.type === 'note' ? trashNote(target.id, workspace) : trashFolder(target.id, workspace);
            return request.then(function (result) {
                if (result.entry) entries.push(result.entry);
                removed = removed.concat(result.removed);
            });
        }).then(function () {
            if (entries.length) record(batchEntry(entries));
            afterNotesTrashed(removed);
            toastAfterReload(tr('tree_selection.deleted_items', 'Moved {{count}} items to the trash', { count: targets.length }));
            reloadTree(removed);
        }).catch(function (error) {
            var message = tr('tree_selection.delete_failed', 'Delete failed: {{error}}', { error: error.message });
            if (!entries.length && !removed.length) {
                running = false;
                errorToast(message);
                return;
            }
            if (entries.length) record(batchEntry(entries));
            afterNotesTrashed(removed);
            errorToastAfterReload(message);
            reloadTree(removed);
        });
    }

    // ============================================
    // Focused row (keyboard target)
    // ============================================

    var treeFocus = null;
    // Whether the last click landed in the tree (Del needs it, see the header)
    var treeActive = false;

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
        treeActive = !!(target && target.closest && target.closest('#left_col'));
        if (!treeActive) return;
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

    /**
     * Point the focus at a row that was reached with the arrow keys
     * (js/tree-keyboard-nav.js), so paste goes where the keyboard is the way
     * it goes where the last click was. It does not set treeActive: Del
     * without a selection still needs a click in the tree.
     * @param {{type: string, id: string|number}} item - Row to focus
     */
    function setFocus(item) {
        if (!item || !item.id) return;
        if (item.type === 'note') {
            var link = noteLink(item.id);
            if (link) treeFocus = noteFocusFromLink(link);
            return;
        }
        if (item.type === 'folder') {
            var header = folderHeader(item.id);
            if (header && !header.classList.contains('system-folder')) treeFocus = folderFocusFromHeader(header);
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

    /**
     * The note has its own shortcuts on the same keys, so the tree only answers
     * while it owns the keyboard (js/pane-focus.js). Without that module the
     * shortcuts stay as they were, always on.
     */
    function treeOwnsKeyboard() {
        var paneFocus = window.PoznotePaneFocus;
        return paneFocus ? paneFocus.isTree() : true;
    }

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

    function selectedTargets() {
        var selection = window.PoznoteTreeSelection;
        return (selection && selection.count() > 0) ? selection.items() : [];
    }

    // Del, or Cmd+Backspace on macOS where keyboards have no forward Delete
    function isDeleteKey(e) {
        if (e.altKey || e.shiftKey) return false;
        if (e.key === 'Delete') return !(e.ctrlKey || e.metaKey);
        return isMacPlatform && e.key === 'Backspace' && e.metaKey && !e.ctrlKey;
    }

    function handleDeleteKey(e) {
        if (!hasTree() || isReadOnly() || !treeOwnsKeyboard()) return;
        if (isTextEditingContext(e.target) || isModalOpen()) return;

        var targets = selectedTargets();
        if (!targets.length) {
            if (!treeActive) return;
            var focus = currentFocus();
            if (!focus || focus.type === 'root') return;
            targets = [{ type: focus.type, id: focus.id }];
        }
        e.preventDefault();
        deleteItems(targets);
    }

    function handleKeydown(e) {
        if (e.defaultPrevented) return;
        if (isDeleteKey(e)) {
            handleDeleteKey(e);
            return;
        }
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

        var key = (e.key || '').toLowerCase();
        var isUndo = key === 'z' && !e.shiftKey;
        var isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
        var isCopy = key === 'c' && !e.shiftKey;
        var isCut = key === 'x' && !e.shiftKey;
        var isPaste = key === 'v' && !e.shiftKey;
        if (!(isUndo || isRedo || isCopy || isCut || isPaste)) return;

        if (!hasTree() || isReadOnly() || !treeOwnsKeyboard()) return;
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

        var selected = selectedTargets();
        if (selected.length) {
            e.preventDefault();
            copyItems(selected, isCut ? 'cut' : 'copy');
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
     * Called by populateNoteActionsMenu / populateFolderActionsMenu (js/utils-menus.js)
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
        copyItems: copyItems,
        deleteItems: deleteItems,
        moveItems: moveItems,
        favoriteItems: favoriteItems,
        paste: paste,
        setFocus: setFocus,
        syncMenu: syncMenu
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
