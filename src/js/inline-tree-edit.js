/**
 * Inline create and rename in the notes tree.
 *
 * The name of a folder or a note is typed straight into its row in the left
 * column instead of a modal: Enter commits, Escape cancels, and clicking away
 * commits a changed value. Creating a folder inserts a draft row at the place
 * the folder will live, so nothing has to be hunted down afterwards.
 *
 * Every entry point (newFolder/editFolderName/renameNote in js/utils.js,
 * createSubfolder in js/folder-hierarchy.js) checks the boolean these
 * functions return and keeps its modal for the pages that have no tree,
 * namely create.php and list_folders.php.
 */
(function () {
    'use strict';

    // Folder to scroll to and flash after the reload that follows a commit.
    var REVEAL_KEY = 'poznoteTreeReveal';
    var FLASH_MS = 1600;

    // Row whose note actions menu was opened last. A note can appear twice in
    // the tree (its folder plus the Favorites section), so a rename has to
    // edit the row the menu was opened from, not the first id match.
    var lastNoteRow = null;

    // The edit in progress; starting another one cancels it first.
    var activeEdit = null;

    function tr(key, fallback, params) {
        return typeof window.t === 'function' ? window.t(key, params || {}, fallback) : fallback;
    }

    function notifyError(message) {
        if (typeof window.showNotificationPopup === 'function') {
            window.showNotificationPopup(message, 'error');
        } else {
            console.error(message);
        }
    }

    function currentWorkspace() {
        return typeof window.getSelectedWorkspace === 'function' ? window.getSelectedWorkspace() : '';
    }

    function isNumericId(value) {
        return /^\d+$/.test(String(value));
    }

    function errorMessage(data) {
        return (data && (data.error || data.message)) || 'Unknown error';
    }

    // ============================================
    // The inline input
    // ============================================

    /**
     * Build the input used by every inline edit.
     *
     * Pointer events are stopped on it: the tree delegates clicks from
     * document (js/notes-list-events.js), and the row around the input still
     * carries data-action="load-note" or "toggle-folder", which would fire on
     * every click made to place the caret. contextmenu is stopped too so the
     * native menu (paste) wins over the row's actions menu.
     */
    function buildInput(value, placeholder) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'tree-inline-input';
        input.value = value || '';
        input.maxLength = 255;
        input.placeholder = placeholder || '';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');

        ['click', 'dblclick', 'mousedown', 'mouseup', 'auxclick', 'contextmenu'].forEach(function (type) {
            input.addEventListener(type, function (event) {
                event.stopPropagation();
            });
        });

        return input;
    }

    /** Leading icons of a label (note type, custom icon), kept while editing. */
    function iconsHtml(label) {
        return Array.prototype.map.call(label.children, function (child) {
            return child.outerHTML;
        }).join('');
    }

    /** Tree rows are draggable, which would swallow text selection attempts. */
    function suspendDrag(row) {
        if (!row) return [];
        var elements = [];
        if (row.getAttribute('draggable') === 'true') elements.push(row);
        Array.prototype.push.apply(elements, row.querySelectorAll('[draggable="true"]'));
        elements.forEach(function (element) {
            element.setAttribute('draggable', 'false');
        });
        return elements;
    }

    function resumeDrag(elements) {
        elements.forEach(function (element) {
            element.setAttribute('draggable', 'true');
        });
    }

    /**
     * Swap a tree row's label for an input and drive its lifecycle.
     *
     * @param {Object} spec
     * @param {HTMLElement} spec.label  Element holding the name (.folder-name, .note-title)
     * @param {HTMLElement} spec.row    Row to mark as editing (.folder-toggle, .note-list-item)
     * @param {string} spec.value       Current name; an unchanged value cancels
     * @param {string} spec.placeholder Placeholder for the input
     * @param {Function} spec.save      save(name, done); done(false, message) keeps editing
     * @param {Function} [spec.discard] Called instead of restoring the label on cancel
     */
    function beginEdit(spec) {
        cancelActiveEdit();

        var label = spec.label;
        var row = spec.row;
        var originalHtml = label.innerHTML;
        var input = buildInput(spec.value, spec.placeholder);
        var draggables = suspendDrag(row);
        var finished = false;
        var saving = false;

        label.innerHTML = iconsHtml(label);
        label.appendChild(input);
        label.classList.add('tree-inline-editing');
        if (row) row.classList.add('tree-row-editing');

        function cancel() {
            if (finished) return;
            finished = true;
            activeEdit = null;
            resumeDrag(draggables);
            if (spec.discard) {
                spec.discard();
            } else {
                label.innerHTML = originalHtml;
                label.classList.remove('tree-inline-editing');
                if (row) row.classList.remove('tree-row-editing');
            }
        }

        function commit() {
            if (finished || saving) return;

            var name = input.value.trim();
            if (!name || name === spec.value) {
                cancel();
                return;
            }

            saving = true;
            input.disabled = true;
            input.classList.add('is-busy');

            spec.save(name, function (succeeded, message) {
                // A successful save reloads the page, so only the failure path
                // has anything left to do: keep the row editable and let the
                // name be corrected (a duplicate name is the common case).
                if (succeeded) {
                    finished = true;
                    activeEdit = null;
                    return;
                }
                saving = false;
                input.disabled = false;
                input.classList.remove('is-busy');
                if (message) notifyError(message);
                input.focus();
                input.select();
            });
        }

        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                commit();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                cancel();
            } else {
                // Keep the tree's own shortcuts out of the way while typing.
                event.stopPropagation();
            }
        });

        input.addEventListener('blur', function () {
            commit();
        });

        activeEdit = { cancel: cancel };

        input.focus();
        input.select();
        return true;
    }

    function cancelActiveEdit() {
        if (activeEdit) activeEdit.cancel();
    }

    // ============================================
    // Locating rows in the tree
    // ============================================

    /**
     * Whether an element of the tree is actually on screen. It is not when the
     * sidebar is collapsed (width 0), and not in the mobile two-pane layout
     * while a note or the Kanban board holds the viewport, which is where the
     * Kanban add button can ask for a subfolder. A modal still works there.
     */
    function isOnScreen(element) {
        if (!element) return false;
        var rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > 0 && rect.left < (window.innerWidth || 0);
    }

    function treeRoot() {
        var root = document.querySelector('#left_col .notes-list-scrollable-content');
        return isOnScreen(root) ? root : null;
    }

    function folderToggle(folderId) {
        if (!isNumericId(folderId)) return null;
        var header = document.querySelector('#left_col .folder-header[data-folder-id="' + folderId + '"]');
        var toggle = header ? header.querySelector(':scope > .folder-toggle') : null;
        return isOnScreen(toggle) ? toggle : null;
    }

    function noteRow(noteId) {
        if (!isNumericId(noteId)) return null;

        // The row the actions menu was opened from, as long as it is still the
        // right note and still in the tree.
        if (lastNoteRow && lastNoteRow.isConnected) {
            var link = lastNoteRow.querySelector('a[data-note-db-id="' + noteId + '"]');
            if (link && isOnScreen(lastNoteRow)) return lastNoteRow;
        }

        var anyLink = document.querySelector('#left_col .note-list-item a[data-note-db-id="' + noteId + '"]');
        var row = anyLink ? anyLink.closest('.note-list-item') : null;
        return isOnScreen(row) ? row : null;
    }

    // ============================================
    // Draft row for a folder being created
    // ============================================

    /**
     * A folder header with no id and no actions: just the folder icon and the
     * input. Reusing the real classes keeps it aligned with its siblings,
     * including the indentation a subfolder gets from its .folder-content.
     */
    function buildDraftFolderRow() {
        var header = document.createElement('div');
        header.className = 'folder-header tree-draft-folder';

        var toggle = document.createElement('div');
        toggle.className = 'folder-toggle';

        var icon = document.createElement('i');
        icon.className = 'lucide lucide-folder folder-icon';

        var label = document.createElement('span');
        label.className = 'folder-name';

        toggle.appendChild(icon);
        toggle.appendChild(label);
        header.appendChild(toggle);

        return { header: header, toggle: toggle, label: label };
    }

    /** Open a folder so a subfolder drafted inside it is visible. */
    function openFolderContent(content) {
        if (typeof window.toggleFolder === 'function') {
            var hidden = content.style.display === 'none' ||
                window.getComputedStyle(content).display === 'none';
            if (hidden) window.toggleFolder(content.id);
        } else {
            content.style.display = 'block';
        }
    }

    /** Where a new folder's draft row goes, or null when the tree can't host it. */
    function draftContainer(parentFolderKey) {
        if (!parentFolderKey) return treeRoot();

        if (!/^folder_\d+$/.test(parentFolderKey)) return null;
        var header = document.querySelector('#left_col .folder-header[data-folder-key="' + parentFolderKey + '"]');
        if (!header) return null;

        var content = header.querySelector(':scope > .folder-content');
        if (!content || !isOnScreen(header)) return null;

        openFolderContent(content);
        return content;
    }

    /**
     * Bring a tree row into view without touching the page's own scroll.
     * scrollIntoView() would walk up to <body>, which on mobile is the
     * horizontal scroller of the two-pane layout (css/index-mobile.css).
     */
    function scrollRowIntoView(row) {
        var scroller = row.closest('.notes-list-scrollable-content') || document.getElementById('left_col');
        if (!scroller) return;

        var rowRect = row.getBoundingClientRect();
        var viewRect = scroller.getBoundingClientRect();
        if (rowRect.top >= viewRect.top && rowRect.bottom <= viewRect.bottom) return;

        var offset = (rowRect.top - viewRect.top) - (scroller.clientHeight - rowRect.height) / 2;
        scroller.scrollTop = Math.max(0, Math.min(
            scroller.scrollTop + offset,
            scroller.scrollHeight - scroller.clientHeight
        ));
    }

    // ============================================
    // Reveal after the reload
    // ============================================

    function rememberFolderReveal(folderId) {
        try {
            sessionStorage.setItem(REVEAL_KEY, 'folder:' + folderId);
        } catch (e) {
            // Private browsing: the reveal is a nicety, the reload still happens.
        }
    }

    function rememberNoteReveal(noteId) {
        try {
            sessionStorage.setItem(REVEAL_KEY, 'note:' + noteId);
        } catch (e) { }
    }

    function applyPendingReveal() {
        var pending = null;
        try {
            pending = sessionStorage.getItem(REVEAL_KEY);
            sessionStorage.removeItem(REVEAL_KEY);
        } catch (e) {
            return;
        }
        if (!pending) return;

        var separator = pending.indexOf(':');
        var kind = pending.slice(0, separator);
        var id = pending.slice(separator + 1);
        if (!isNumericId(id)) return;

        if (kind === 'folder') {
            // Same treatment as the note header's folder breadcrumb: expand the
            // ancestors, scroll the header into view and flash it.
            if (typeof window.revealFolderInTree === 'function') {
                window.revealFolderInTree(id);
            }
            return;
        }

        var link = document.querySelector('#left_col .note-list-item a[data-note-db-id="' + id + '"]');
        var row = link ? link.closest('.note-list-item') : null;
        if (!row) return;

        scrollRowIntoView(row);
        row.classList.add('tree-reveal-highlight');
        setTimeout(function () {
            row.classList.remove('tree-reveal-highlight');
        }, FLASH_MS);
    }

    // ============================================
    // Saving
    // ============================================

    function sendJson(url, method, body, extraHeaders, callback) {
        var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        Object.keys(extraHeaders || {}).forEach(function (name) {
            headers[name] = extraHeaders[name];
        });

        fetch(url, {
            method: method,
            headers: headers,
            credentials: 'same-origin',
            body: JSON.stringify(body)
        })
            .then(function (response) {
                return response.json().catch(function () { return {}; });
            })
            .then(function (data) {
                callback(!!(data && data.success), data);
            })
            .catch(function (error) {
                callback(false, { error: error.message });
            });
    }

    function saveNewFolder(name, parentFolderKey, done) {
        var body = { folder_name: name };
        var ws = currentWorkspace();
        if (ws) body.workspace = ws;
        if (parentFolderKey) body.parent_folder_key = parentFolderKey;

        sendJson('/api/v1/folders', 'POST', body, null, function (succeeded, data) {
            if (!succeeded) {
                done(false, errorMessage(data));
                return;
            }
            done(true);
            if (data.folder_id) rememberFolderReveal(data.folder_id);
            window.location.reload();
        });
    }

    function saveFolderName(folderId, name, done, previousName) {
        var body = { name: name };
        var ws = currentWorkspace();
        if (ws) body.workspace = ws;

        sendJson('/api/v1/folders/' + encodeURIComponent(folderId), 'PATCH', body, null, function (succeeded, data) {
            if (!succeeded) {
                done(false, errorMessage(data));
                return;
            }
            done(true);
            if (window.PoznoteTreeHistory && previousName) {
                window.PoznoteTreeHistory.record({
                    type: 'folder-rename', folderId: String(folderId), from: previousName, to: name, workspace: ws
                });
            }
            rememberFolderReveal(folderId);
            window.location.reload();
        });
    }

    function saveNoteName(noteId, name, done, previousName) {
        // Send this tab's editor session so renaming the note it has open
        // passes the edit lock; a note locked elsewhere is still refused.
        var sessionId = typeof window.getCurrentEditorSessionId === 'function'
            ? window.getCurrentEditorSessionId()
            : '';

        var headers = sessionId ? { 'X-Editor-Session-ID': sessionId } : null;

        // Heading only: the API leaves the content untouched when it is absent.
        var body = { heading: name, editor_session_id: sessionId };

        sendJson('/api/v1/notes/' + encodeURIComponent(noteId), 'PATCH', body, headers, function (succeeded, data) {
            if (!succeeded) {
                done(false, errorMessage(data));
                return;
            }
            done(true);
            if (window.PoznoteTreeHistory && previousName) {
                window.PoznoteTreeHistory.record({
                    type: 'note-rename', noteId: String(noteId), from: previousName, to: name
                });
            }
            rememberNoteReveal(noteId);
            window.location.reload();
        });
    }

    // ============================================
    // Public API
    // ============================================

    /**
     * Draft a new folder in the tree, at the root or inside a parent folder.
     * @param {string|null} parentFolderKey - "folder_123" for a subfolder
     * @returns {boolean} false when the tree is absent (caller falls back)
     */
    function createFolder(parentFolderKey) {
        var container = draftContainer(parentFolderKey);
        if (!container) return false;

        var draft = buildDraftFolderRow();
        container.appendChild(draft.header);

        beginEdit({
            label: draft.label,
            row: draft.toggle,
            value: '',
            placeholder: parentFolderKey
                ? tr('modals.folder.new_subfolder_placeholder', 'New subfolder name')
                : tr('modals.folder.new_placeholder', 'New folder name'),
            discard: function () { draft.header.remove(); },
            save: function (name, done) { saveNewFolder(name, parentFolderKey, done); }
        });

        scrollRowIntoView(draft.header);
        return true;
    }

    /**
     * Rename a folder in its tree row.
     * @returns {boolean} false when the folder has no row (caller falls back)
     */
    function renameFolder(folderId, currentName) {
        var toggle = folderToggle(folderId);
        var label = toggle ? toggle.querySelector('.folder-name') : null;
        if (!label) return false;

        return beginEdit({
            label: label,
            row: toggle,
            value: currentName || '',
            placeholder: tr('modals.folder.rename_placeholder', 'New folder name'),
            save: function (name, done) { saveFolderName(folderId, name, done, currentName || ''); }
        });
    }

    /**
     * Rename a note in its tree row.
     * @returns {boolean} false when the note has no row (caller falls back)
     */
    function renameNote(noteId, currentTitle) {
        var row = noteRow(noteId);
        var label = row ? row.querySelector('.note-title') : null;
        if (!label) return false;

        return beginEdit({
            label: label,
            row: row,
            value: currentTitle || '',
            placeholder: tr('modals.note.rename_placeholder', 'New note title'),
            save: function (name, done) { saveNoteName(noteId, name, done, currentTitle || ''); }
        });
    }

    // Remember which row opened a note actions menu, for renameNote() above.
    // Capture phase: the menu handlers stop propagation on their way out.
    ['click', 'contextmenu'].forEach(function (type) {
        document.addEventListener(type, function (event) {
            if (!event.target || !event.target.closest) return;
            var item = event.target.closest('#left_col .note-list-item');
            if (item) lastNoteRow = item;
        }, true);
    });

    window.PoznoteInlineTreeEdit = {
        createFolder: createFolder,
        renameFolder: renameFolder,
        renameNote: renameNote
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyPendingReveal);
    } else {
        applyPendingReveal();
    }
})();
