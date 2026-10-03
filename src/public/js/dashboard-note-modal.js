// Dashboard: a task list card opens in a modal instead of index.php.
//
// The list is worked on in place: each task has its checkbox and its text,
// whose links open on a click and which turns into a field when the text
// itself is clicked, and a field adds a task. Saves go through
// PATCH api/v1/notes/{id} with if_version, like the diary journal's editor:
// no edit lock is taken, and a list changed elsewhere in the meantime is
// never overwritten. "Open in the editor" goes to the note in index.php.
// Every other note type keeps opening straight in index.php.
(function () {
    'use strict';

    var SAVE_DELAY_MS = 1200;

    var txt = window.DASHBOARD_NOTE_MODAL_TXT || {};
    // State of the note on screen, null while the modal is closed
    var state = null;
    var insertOrderRequest = null;
    var insertOrder = 'bottom';

    function modalEl() {
        return document.getElementById('dashboardNoteModal');
    }

    function canOpen(note) {
        return !!note && note.type === 'tasklist';
    }

    function jsonHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };
    }

    function readJson(response) {
        return response.json().catch(function () { return {}; });
    }

    function fetchJson(url) {
        return fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (response) {
                return readJson(response).then(function (result) {
                    if (!response.ok || !result.note) {
                        throw new Error(result.error || result.message || ('HTTP ' + response.status));
                    }
                    return result.note;
                });
            });
    }

    function setStatus(kind, text) {
        var status = document.getElementById('dashboardNoteModalStatus');
        if (!status) return;
        status.textContent = text || '';
        status.classList.toggle('is-error', kind === 'error');
        status.classList.toggle('is-saving', kind === 'saving');
    }

    // Same setting as the tasklist notes: where a new task goes, and where a
    // newly completed one lands in the completed group
    function loadInsertOrder() {
        if (insertOrderRequest) return insertOrderRequest;
        insertOrderRequest = fetch('api/v1/settings/tasklist_insert_order', { credentials: 'same-origin' })
            .then(readJson)
            .then(function (data) {
                insertOrder = (data && data.success && data.value === 'top') ? 'top' : 'bottom';
            })
            .catch(function () { /* keep the default */ });
        return insertOrderRequest;
    }

    // --- Saving ---

    function listContent(current) {
        return JSON.stringify(current.tasks.map(function (task) {
            task.text = String(task.text || '').trim();
            return task;
        }));
    }

    function scheduleSave() {
        state.dirty = true;
        if (state.conflict) return;
        setStatus('', '');
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(save, SAVE_DELAY_MS);
    }

    // Resolves to true once the list is on the server. A failed save leaves
    // the state dirty, so the next change (or closing) retries; a version
    // conflict stops the saving for good, the writer is told.
    function save() {
        var current = state;
        if (!current) return Promise.resolve(true);
        clearTimeout(current.saveTimer);
        current.saveTimer = null;
        if (current.conflict) return Promise.resolve(false);
        if (current.saving) {
            current.saveAgain = true;
            return current.saving;
        }
        if (!current.dirty) return Promise.resolve(true);

        var content = listContent(current);
        var completedWithReminder = current.clearReminders.splice(0);
        current.dirty = false;
        setStatus('saving', txt.saving || 'Saving...');

        current.saving = fetch('api/v1/notes/' + encodeURIComponent(current.note.id), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: jsonHeaders(),
            body: JSON.stringify({ content: content, if_version: current.version })
        })
            .then(function (response) {
                return readJson(response).then(function (result) {
                    if (response.status === 409) {
                        current.conflict = true;
                        throw new Error(result.error || 'version_conflict');
                    }
                    if (!response.ok || !result.note) {
                        throw new Error(result.error || result.message || ('HTTP ' + response.status));
                    }
                    if (result.note.version) current.version = result.note.version;
                    current.savedContent = content;
                    completedWithReminder.forEach(function (taskId) {
                        cancelTaskReminder(current.note.id, taskId);
                    });
                    if (state === current) setStatus('saved', txt.saved || 'Saved');
                    return true;
                });
            })
            .catch(function (err) {
                current.dirty = true;
                current.clearReminders = completedWithReminder.concat(current.clearReminders);
                if (state === current) {
                    if (current.conflict) {
                        setStatus('error', txt.conflict ||
                            'This note was changed elsewhere. Your latest changes here were not saved: reload the page to see the current version.');
                    } else {
                        setStatus('error', (txt.saveError || 'Could not save this note.') + ' ' + err.message);
                    }
                }
                return false;
            })
            .then(function (ok) {
                current.saving = null;
                if (current.saveAgain) {
                    current.saveAgain = false;
                    if (current.dirty && state === current) return save();
                }
                return ok;
            });
        return current.saving;
    }

    function saveNow() {
        state.dirty = true;
        if (state.conflict) return;
        save();
    }

    // Completing or deleting a task cancels its pending reminder
    function cancelTaskReminder(noteId, taskId) {
        fetch('api/v1/notes/' + encodeURIComponent(noteId) + '/task-reminder', {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: jsonHeaders(),
            body: JSON.stringify({ task_id: String(taskId) })
        }).catch(function (e) {
            console.debug('dashboard-note-modal: cancelTaskReminder() failed:', e);
        });
    }

    // --- Task list editor ---

    function parseTasks(content) {
        var tasks;
        try {
            tasks = JSON.parse(content || '[]');
        } catch (e) {
            tasks = [];
        }
        return Array.isArray(tasks) ? tasks.filter(function (task) { return task && typeof task === 'object'; }) : [];
    }

    function groupTasks(tasks) {
        var groups = { important: [], normal: [], completed: [] };
        tasks.forEach(function (task) {
            if (task.completed) groups.completed.push(task);
            else if (task.important) groups.important.push(task);
            else groups.normal.push(task);
        });
        return groups;
    }

    // Same order rules as tasklist-crud.js: important open tasks first, then
    // the other open tasks, completed last. A newly completed task lands at
    // the top of the completed group (bottom insert order) or at its end.
    function reorderAfterToggle(tasks, toggled) {
        var groups = groupTasks(tasks.filter(function (task) { return task !== toggled; }));
        if (toggled.completed) {
            if (insertOrder === 'bottom') groups.completed.unshift(toggled);
            else groups.completed.push(toggled);
        } else if (toggled.important) {
            groups.important.push(toggled);
        } else {
            groups.normal.push(toggled);
        }
        return [].concat(groups.important, groups.normal, groups.completed);
    }

    function autosizeTaskText(field) {
        field.style.height = 'auto';
        field.style.height = field.scrollHeight + 'px';
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // The links a tasklist note makes of its task text (linkifyHtml in
    // js/tasklist-order-drag.js): http(s) and www addresses, a long one
    // shortened, all opening in a new tab
    function linkifyTaskText(text) {
        return escapeHtml(text).replace(/((https?:\/\/)[^\s"'<>]+)|(www\.[^\s"'<>]+)/ig, function (m) {
            var href = /^https?:\/\//i.test(m) ? m : 'http://' + m;
            var label = m.length > 50 ? m.substring(0, 47) + '...' : m;
            return '<a href="' + href + '" target="_blank" rel="noopener noreferrer" title="' + m + '">' + label + '</a>';
        });
    }

    // A task's text reads with its links clickable; a click on the text
    // itself (not on a link) swaps it for a field, until the field loses
    // the focus. Enter or Escape ends the edit, Shift+Enter adds a line.
    function buildTaskText(task, box) {
        var display = document.createElement('div');
        display.className = 'dashboard-note-task-text';
        display.tabIndex = 0;
        display.innerHTML = linkifyTaskText(task.text);

        function edit() {
            var field = document.createElement('textarea');
            field.className = 'dashboard-note-task-text dashboard-note-task-field';
            field.rows = 1;
            field.value = String(task.text || '');
            field.spellcheck = true;
            field.addEventListener('input', function () {
                autosizeTaskText(field);
                // An emptied task keeps its text until something is typed again
                if (!field.value.trim()) return;
                task.text = field.value;
                box.setAttribute('aria-label', field.value);
                scheduleSave();
            });
            field.addEventListener('keydown', function (e) {
                if (e.isComposing) return;
                if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                    // The modal stays open: this Escape only ends the edit
                    e.preventDefault();
                    e.stopPropagation();
                    field.blur();
                }
            });
            field.addEventListener('blur', function () {
                display.innerHTML = linkifyTaskText(task.text);
                if (field.isConnected) field.replaceWith(display);
            });
            display.replaceWith(field);
            autosizeTaskText(field);
            field.focus({ preventScroll: true });
            field.setSelectionRange(field.value.length, field.value.length);
        }

        display.addEventListener('click', function (e) {
            if (e.target.closest('a')) return;
            // Releasing a text selection is not a request to edit
            var selection = window.getSelection ? window.getSelection() : null;
            if (selection && !selection.isCollapsed && display.contains(selection.anchorNode)) return;
            edit();
        });
        display.addEventListener('keydown', function (e) {
            if (e.target !== display || (e.key !== 'Enter' && e.key !== 'F2')) return;
            e.preventDefault();
            edit();
        });
        return display;
    }

    function buildTaskRow(task) {
        var row = document.createElement('li');
        row.className = 'dashboard-note-task' +
            (task.completed ? ' is-done' : '') +
            (task.important && !task.completed ? ' is-important' : '');

        var box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'dashboard-note-task-check';
        box.checked = !!task.completed;
        box.setAttribute('aria-label', String(task.text || ''));
        box.addEventListener('change', function () {
            task.completed = box.checked;
            if (task.completed && task.dueReminder) {
                task.dueReminder = false;
                state.clearReminders.push(task.id);
            }
            state.tasks = reorderAfterToggle(state.tasks, task);
            renderTasks();
            saveNow();
        });
        row.appendChild(box);

        row.appendChild(buildTaskText(task, box));

        // Completed tasks can be deleted, as in the embedded task list
        if (task.completed) {
            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'dashboard-note-task-delete';
            del.title = txt.deleteTask || 'Delete';
            del.setAttribute('aria-label', txt.deleteTask || 'Delete');
            del.innerHTML = '<i class="lucide lucide-trash-2"></i>';
            del.addEventListener('click', function () {
                if (task.dueReminder) state.clearReminders.push(task.id);
                state.tasks = state.tasks.filter(function (item) { return item !== task; });
                renderTasks();
                saveNow();
            });
            row.appendChild(del);
        }
        return row;
    }

    // A subtask of a task (js/tasklist-subtasks.js): an indented row that can
    // be ticked here; its text is edited in the task list itself
    function buildSubtaskRow(subtask) {
        var row = document.createElement('li');
        row.className = 'dashboard-note-task dashboard-note-subtask' + (subtask.completed ? ' is-done' : '');

        var box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'dashboard-note-task-check';
        box.checked = !!subtask.completed;
        box.setAttribute('aria-label', String(subtask.text || ''));
        box.addEventListener('change', function () {
            subtask.completed = box.checked;
            row.classList.toggle('is-done', box.checked);
            saveNow();
        });
        row.appendChild(box);

        var text = document.createElement('div');
        text.className = 'dashboard-note-subtask-text';
        text.innerHTML = linkifyTaskText(subtask.text);
        row.appendChild(text);

        return row;
    }

    function renderTasks() {
        var list = state.editor.querySelector('.dashboard-note-task-list');
        var empty = state.editor.querySelector('.dashboard-note-task-empty');
        list.innerHTML = '';
        state.tasks.forEach(function (task) {
            list.appendChild(buildTaskRow(task));
            (Array.isArray(task.subtasks) ? task.subtasks : []).forEach(function (subtask) {
                if (subtask && typeof subtask === 'object' && String(subtask.text || '').trim()) {
                    list.appendChild(buildSubtaskRow(subtask));
                }
            });
        });
        empty.hidden = state.tasks.length > 0;
    }

    function addTask(text) {
        loadInsertOrder().then(function () {
            if (!state) return;
            var groups = groupTasks(state.tasks);
            var task = {
                id: Date.now() + Math.random(),
                text: text,
                completed: false,
                noteId: Number(state.note.id) || state.note.id,
                important: false,
                dueAt: null
            };
            if (insertOrder === 'top') groups.normal.unshift(task);
            else groups.normal.push(task);
            state.tasks = [].concat(groups.important, groups.normal, groups.completed);
            renderTasks();
            saveNow();
        });
    }

    function buildTaskEditor(fresh) {
        state.tasks = parseTasks(fresh.content);
        loadInsertOrder();

        var editor = document.createElement('div');
        editor.className = 'dashboard-note-editor-tasks';

        var add = document.createElement('input');
        add.type = 'text';
        add.className = 'dashboard-note-task-add';
        add.placeholder = txt.addTask || 'Write a new task and press Enter to add to list...';
        add.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' || e.isComposing) return;
            e.preventDefault();
            var value = add.value.trim();
            if (!value) return;
            add.value = '';
            addTask(value);
        });
        editor.appendChild(add);

        var list = document.createElement('ul');
        list.className = 'dashboard-note-task-list';
        editor.appendChild(list);

        var empty = document.createElement('p');
        empty.className = 'dashboard-note-task-empty';
        empty.textContent = txt.emptyTasks || 'No tasks yet.';
        editor.appendChild(empty);

        state.editor = editor;
        return editor;
    }

    // What the board card shows of a saved list, as buildNoteCardPreview
    // (lib/checklists.php) builds it on the server
    function buildCardPreview(content) {
        var tasks = [];
        parseTasks(content).forEach(function (task) {
            var label = String(task.text || '').trim();
            if (label && tasks.length < 10) tasks.push({ text: label, done: !!task.completed });
        });
        return { text: '', tasks: tasks, image: null };
    }

    // --- Open / close ---

    function showBody(node) {
        var body = document.getElementById('dashboardNoteModalBody');
        body.innerHTML = '';
        body.appendChild(node);
    }

    function showMessage(text, isError) {
        var p = document.createElement('p');
        p.className = 'dashboard-note-modal-message' + (isError ? ' is-error' : '');
        p.textContent = text;
        showBody(p);
    }

    function focusTaskInput() {
        // No keyboard popping up over the list on a touch screen
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
        var input = state.editor.querySelector('.dashboard-note-task-add');
        if (input) input.focus({ preventScroll: true });
    }

    function open(note, options) {
        var modal = modalEl();
        if (!modal || state || !canOpen(note)) return false;

        state = {
            note: note,
            onSaved: options && typeof options.onSaved === 'function' ? options.onSaved : null,
            editor: null,
            tasks: null,
            version: '',
            dirty: false,
            saving: null,
            saveAgain: false,
            saveTimer: null,
            conflict: false,
            savedContent: null,
            clearReminders: [],
            lastFocused: document.activeElement
        };
        var current = state;

        var title = document.getElementById('dashboardNoteModalTitle');
        title.textContent = note.heading || '';
        document.getElementById('dashboardNoteModalOpen').setAttribute('href', note.url || '#');
        setStatus('', '');
        showMessage(txt.loading || 'Loading...', false);
        modal.style.display = 'flex';
        document.documentElement.classList.add('dashboard-note-modal-open');
        var closeBtn = modal.querySelector('.dashboard-note-modal-close');
        if (closeBtn) closeBtn.focus({ preventScroll: true });

        // The source is read afresh: the card may be minutes old, and the
        // version token must be the one the save is checked against.
        var url = 'api/v1/notes/' + encodeURIComponent(note.id);
        if (note.workspace) url += '?workspace=' + encodeURIComponent(note.workspace);
        fetchJson(url)
            .then(function (fresh) {
                if (state !== current) return;
                if ((fresh.type || 'note') !== 'tasklist') {
                    // Converted since the board was drawn: the full editor
                    // is the only one that knows this type now
                    closeNow();
                    window.location.href = note.url;
                    return;
                }
                current.version = fresh.version || '';
                if (fresh.heading) title.textContent = fresh.heading;
                showBody(buildTaskEditor(fresh));
                renderTasks();
                focusTaskInput();
            })
            .catch(function (err) {
                if (state !== current) return;
                showMessage((txt.loadError || 'Could not load this note.') + ' ' + err.message, true);
            });
        return true;
    }

    function closeNow() {
        var current = state;
        if (!current) return;
        clearTimeout(current.saveTimer);
        state = null;

        var modal = modalEl();
        if (modal) modal.style.display = 'none';
        document.documentElement.classList.remove('dashboard-note-modal-open');
        document.getElementById('dashboardNoteModalBody').innerHTML = '';
        setStatus('', '');

        if (current.savedContent !== null && current.onSaved) {
            current.onSaved(buildCardPreview(current.savedContent));
        }
        var last = current.lastFocused;
        if (last && document.contains(last) && typeof last.focus === 'function') {
            last.focus({ preventScroll: true });
        }
    }

    // Save what is pending, then close. When the save fails the modal stays
    // open with the error, so nothing written is lost; closing again retries.
    // Resolves to true once the modal is closed.
    function finish() {
        var current = state;
        if (!current) return Promise.resolve(true);
        clearTimeout(current.saveTimer);
        current.saveTimer = null;
        var pending = current.dirty && !current.conflict ? save() : (current.saving || Promise.resolve(true));
        return pending.then(function (ok) {
            if (state !== current) return true;
            if (!ok && !current.conflict) return false;
            closeNow();
            return true;
        });
    }

    function init() {
        var modal = modalEl();
        if (!modal) return;

        modal.querySelectorAll('[data-action="close-note-modal"]').forEach(function (btn) {
            btn.addEventListener('click', function () { finish(); });
        });

        // A plain click on "Open in the editor" saves first; a modified click
        // (new tab) leaves the modal open
        var openLink = document.getElementById('dashboardNoteModalOpen');
        if (openLink) {
            openLink.addEventListener('click', function (e) {
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                var href = openLink.href;
                finish().then(function (closed) {
                    if (closed) window.location.href = href;
                });
            });
        }

        var pressedOnBackdrop = false;
        modal.addEventListener('mousedown', function (e) {
            pressedOnBackdrop = (e.target === modal);
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal && pressedOnBackdrop) finish();
            pressedOnBackdrop = false;
        });

        document.addEventListener('keydown', function (e) {
            if (!state) return;
            if (e.key === 'Escape' && !e.isComposing) {
                e.preventDefault();
                finish();
                return;
            }
            // The Latin letter even on a Cyrillic or Greek layout (js/shortcut-key.js)
            var key = window.poznoteShortcutKey ? window.poznoteShortcutKey(e) : (e.key || '').toLowerCase();
            if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 's') {
                e.preventDefault();
                save();
            }
        });

        window.addEventListener('beforeunload', function (e) {
            if (!state || !(state.dirty || state.saving)) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }

    window.poznoteDashboardNoteModal = { canOpen: canOpen, open: open };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
