// Embedded task lists inside regular HTML notes.
//
// A note persists only a small marker:
//   <div class="tasklist-embed" data-task-embed="123" contenteditable="false">
//     <a class="tasklist-embed-link" href="index.php?note=123">Heading</a>
//   </div>
// The interactive widget rendered inside (.tasklist-embed-widget) is runtime
// UI: the server strips it on save (sanitizeHtml) and this file rebuilds it
// on load. The fallback link keeps public and exported notes usable.
(function () {
    'use strict';

    function t(key, vars, fallback) {
        return (typeof window.t === 'function') ? window.t(key, vars, fallback) : (fallback || key);
    }

    function currentWorkspace() {
        return (typeof getCurrentWorkspace === 'function') ? getCurrentWorkspace() : '';
    }

    function editorSessionId() {
        return (typeof window.getCurrentEditorSessionId === 'function')
            ? window.getCurrentEditorSessionId()
            : '';
    }

    function localDateStringNow() {
        var now = new Date();
        return now.getFullYear() + '-'
            + String(now.getMonth() + 1).padStart(2, '0') + '-'
            + String(now.getDate()).padStart(2, '0') + 'T'
            + String(now.getHours()).padStart(2, '0') + ':'
            + String(now.getMinutes()).padStart(2, '0');
    }

    function isOverdue(task) {
        if (!task.dueAt || task.completed) return false;
        var now = localDateStringNow();
        return task.dueAt.length > 10 ? task.dueAt < now : task.dueAt < now.substring(0, 10);
    }

    function formatDueDate(dueAt) {
        if (!dueAt) return '';
        var date = new Date(
            parseInt(dueAt.substring(0, 4), 10),
            parseInt(dueAt.substring(5, 7), 10) - 1,
            parseInt(dueAt.substring(8, 10), 10),
            dueAt.length > 10 ? parseInt(dueAt.substring(11, 13), 10) : 0,
            dueAt.length > 10 ? parseInt(dueAt.substring(14, 16), 10) : 0
        );
        var text = (typeof window.poznoteFormatDateOnly === 'function')
            ? window.poznoteFormatDateOnly(date)
            : date.toLocaleDateString();
        if (dueAt.length > 10) {
            text += ' ' + ((typeof window.poznoteFormatTimeOnly === 'function')
                ? window.poznoteFormatTimeOnly(date)
                : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
        return text;
    }

    function parseTasks(content) {
        var tasks;
        try {
            tasks = JSON.parse(content || '[]');
        } catch (e) {
            tasks = [];
        }
        return Array.isArray(tasks) ? tasks : [];
    }

    // ===== Hydration =====

    function initializeTaskListEmbeds(root) {
        var scope = (root && typeof root.querySelectorAll === 'function') ? root : document;
        var embeds = scope.querySelectorAll('.tasklist-embed[data-task-embed]');
        embeds.forEach(function (embed) {
            hydrateEmbed(embed);
        });
    }

    async function hydrateEmbed(embed) {
        var noteId = embed.getAttribute('data-task-embed');
        if (!noteId) return;

        // The marker itself must always stay atomic in the editor
        embed.setAttribute('contenteditable', 'false');

        try {
            var response = await fetch('/api/v1/notes/' + encodeURIComponent(noteId)
                + '?workspace=' + encodeURIComponent(currentWorkspace()), { credentials: 'same-origin' });
            var data = await response.json();

            if (!data || !data.success || !data.note || data.note.type !== 'tasklist') {
                renderUnavailable(embed);
                return;
            }

            renderWidget(embed, data.note, parseTasks(data.note.content));
        } catch (e) {
            // Network error: keep the fallback link untouched
        }
    }

    function replaceWidget(embed, widget) {
        embed.querySelectorAll('.tasklist-embed-widget').forEach(function (old) {
            old.remove();
        });
        embed.appendChild(widget);
    }

    function renderUnavailable(embed) {
        var widget = document.createElement('div');
        widget.className = 'tasklist-embed-widget';
        widget.setAttribute('contenteditable', 'false');

        var msg = document.createElement('div');
        msg.className = 'tasklist-embed-unavailable';
        msg.textContent = t('tasklist_embed.unavailable', null, 'This task list is no longer available.');
        widget.appendChild(msg);

        replaceWidget(embed, widget);
    }

    function renderWidget(embed, note, tasks) {
        var noteId = note.id;
        var heading = note.heading || t('note_reference.untitled', null, 'Untitled');
        var noteUrl = 'index.php?note=' + noteId
            + (currentWorkspace() ? '&workspace=' + encodeURIComponent(currentWorkspace()) : '');

        // Keep the persisted fallback link in sync with the list's current name
        var fallback = embed.querySelector(':scope > .tasklist-embed-link');
        if (fallback) {
            fallback.textContent = heading;
            fallback.href = noteUrl;
        }

        var widget = document.createElement('div');
        widget.className = 'tasklist-embed-widget';
        widget.setAttribute('contenteditable', 'false');

        var header = document.createElement('div');
        header.className = 'tasklist-embed-header';

        var icon = document.createElement('i');
        icon.className = 'lucide lucide-list-todo';
        header.appendChild(icon);

        var title = document.createElement('a');
        title.className = 'tasklist-embed-title';
        title.href = noteUrl;
        title.textContent = heading;
        header.appendChild(title);

        var done = tasks.filter(function (task) { return task.completed; }).length;
        var count = document.createElement('span');
        count.className = 'tasklist-embed-count';
        count.textContent = done + ' / ' + tasks.length;
        header.appendChild(count);

        widget.appendChild(header);

        if (tasks.length > 0) {
            var list = document.createElement('div');
            list.className = 'tasklist-embed-list';
            tasks.forEach(function (task) {
                list.appendChild(renderTaskRow(embed, noteId, task));
            });
            widget.appendChild(list);
        } else {
            var empty = document.createElement('div');
            empty.className = 'tasklist-embed-empty';
            empty.textContent = t('tasklist_embed.empty', null, 'No tasks in this list yet.');
            widget.appendChild(empty);
        }

        replaceWidget(embed, widget);
    }

    function renderTaskRow(embed, noteId, task) {
        var row = document.createElement('div');
        row.className = 'tasklist-embed-task'
            + (task.completed ? ' completed' : '')
            + (task.important && !task.completed ? ' important' : '');

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tasklist-embed-checkbox';
        checkbox.checked = !!task.completed;
        checkbox.addEventListener('change', function () {
            toggleEmbedTask(embed, noteId, task, checkbox);
        });
        row.appendChild(checkbox);

        var text = document.createElement('span');
        text.className = 'tasklist-embed-text';
        text.textContent = task.text || '';
        row.appendChild(text);

        if (task.important && !task.completed) {
            var star = document.createElement('i');
            star.className = 'lucide lucide-star tasklist-embed-star';
            row.appendChild(star);
        }

        if (task.dueAt) {
            var due = document.createElement('span');
            due.className = 'tasklist-embed-due' + (isOverdue(task) ? ' overdue' : '');
            var dueIcon = document.createElement('i');
            dueIcon.className = 'lucide lucide-calendar-alt';
            due.appendChild(dueIcon);
            due.appendChild(document.createTextNode(formatDueDate(task.dueAt)));
            row.appendChild(due);
        }

        return row;
    }

    // Toggle a task in the source tasklist note (read-modify-write through the
    // notes API, same flow as the global tasks page), then re-render every
    // embed of that list.
    async function toggleEmbedTask(embed, noteId, task, checkbox) {
        var newCompleted = checkbox.checked;
        checkbox.disabled = true;

        try {
            var noteResp = await fetch('/api/v1/notes/' + encodeURIComponent(noteId)
                + '?workspace=' + encodeURIComponent(currentWorkspace()), { credentials: 'same-origin' });
            var noteData = await noteResp.json();
            if (!noteData || !noteData.success || !noteData.note || noteData.note.type !== 'tasklist') {
                throw new Error('embed target unavailable');
            }

            var tasks = parseTasks(noteData.note.content);
            var target = tasks.find(function (item) { return String(item.id) === String(task.id); });
            if (!target) {
                throw new Error('task not found');
            }

            target.completed = newCompleted;
            var clearReminder = newCompleted && target.dueReminder;
            if (clearReminder) target.dueReminder = false;

            var sessionId = editorSessionId();
            var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
            var payload = { content: JSON.stringify(tasks) };
            if (sessionId) {
                headers['X-Editor-Session-ID'] = sessionId;
                payload.editor_session_id = sessionId;
            }

            var updateResp = await fetch('/api/v1/notes/' + encodeURIComponent(noteId), {
                method: 'PATCH',
                headers: headers,
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });
            var updateData = await updateResp.json();
            if (!updateData || !updateData.success) {
                throw new Error('embed task save failed');
            }

            // The tasklist note may sit in the in-app DOM cache; drop it so
            // navigating there (e.g. via the widget title) shows fresh state
            if (typeof window.invalidateNoteDomCache === 'function') {
                window.invalidateNoteDomCache(noteId);
            }

            if (clearReminder) {
                // Completing a task cancels its pending reminder
                fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/task-reminder', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ task_id: String(task.id) })
                }).catch(function () { });
            }

            refreshEmbedsForNote(noteId);
        } catch (e) {
            checkbox.checked = !newCompleted;
            checkbox.disabled = false;
        }
    }

    function refreshEmbedsForNote(noteId) {
        document.querySelectorAll('.tasklist-embed[data-task-embed="' + String(noteId) + '"]')
            .forEach(function (embed) {
                hydrateEmbed(embed);
            });
    }

    // ===== Task list picker modal (for the slash command) =====

    var pickerState = { targetNoteId: null, notes: [], onPicked: null };

    function openTaskListPickerModal(onPicked) {
        var modal = document.getElementById('taskListPickerModal');
        if (!modal) return;

        pickerState = {
            targetNoteId: null,
            notes: [],
            onPicked: (typeof onPicked === 'function') ? onPicked : null
        };

        attachPickerHandlers(modal);

        var searchInput = document.getElementById('taskListPickerSearchInput');
        if (searchInput) searchInput.value = '';

        var list = document.getElementById('taskListPickerList');
        if (list) list.innerHTML = '';

        updatePickerConfirmState();

        modal.style.display = 'flex';
        loadPickerTargets('');

        if (searchInput) {
            setTimeout(function () { searchInput.focus(); }, 0);
        }
    }

    window.openTaskListPickerModal = openTaskListPickerModal;

    function attachPickerHandlers(modal) {
        if (modal.dataset.handlersAttached === 'true') return;

        var searchInput = document.getElementById('taskListPickerSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function (e) {
                loadPickerTargets(e.target.value || '');
            });
        }

        var confirmBtn = document.getElementById('confirmTaskListPickerBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', confirmPickerChoice);
        }

        modal.dataset.handlersAttached = 'true';
    }

    function updatePickerConfirmState() {
        var confirmBtn = document.getElementById('confirmTaskListPickerBtn');
        if (confirmBtn) confirmBtn.disabled = !pickerState.targetNoteId;
    }

    async function loadPickerTargets(searchQuery) {
        var list = document.getElementById('taskListPickerList');
        if (!list) return;

        list.innerHTML = '<div class="move-task-empty">'
            + t('modals.task_move.loading', null, 'Loading...')
            + '</div>';

        try {
            var response = await fetch('/api/v1/notes?workspace=' + encodeURIComponent(currentWorkspace()), { credentials: 'same-origin' });
            var data = await response.json();

            var notes = (data && data.success && Array.isArray(data.notes)) ? data.notes : [];
            notes = notes.filter(function (n) { return n.type === 'tasklist'; });

            if (searchQuery && searchQuery.trim()) {
                var q = searchQuery.toLowerCase().trim();
                notes = notes.filter(function (n) { return (n.heading || '').toLowerCase().includes(q); });
            }

            pickerState.notes = notes;
            renderPickerTargets(notes, searchQuery);
            updatePickerConfirmState();
        } catch (e) {
            list.innerHTML = '<div class="move-task-empty">'
                + t('modals.task_move.error', null, 'Unable to load task lists.')
                + '</div>';
        }
    }

    function renderPickerTargets(notes, searchQuery) {
        var list = document.getElementById('taskListPickerList');
        if (!list) return;

        list.innerHTML = '';

        if (!notes || notes.length === 0) {
            list.innerHTML = '<div class="move-task-empty">'
                + t('modals.task_move.empty', null, 'No task lists found.')
                + '</div>';
        } else {
            notes.forEach(function (note) {
                var item = document.createElement('button');
                item.type = 'button';
                item.className = 'move-task-item';
                if (String(note.id) === String(pickerState.targetNoteId)) {
                    item.classList.add('selected');
                }

                var titleSpan = document.createElement('span');
                titleSpan.textContent = note.heading || t('note_reference.untitled', null, 'Untitled');
                item.appendChild(titleSpan);

                if (note.folder) {
                    var meta = document.createElement('small');
                    meta.textContent = note.folder;
                    item.appendChild(meta);
                }

                item.addEventListener('click', function () {
                    pickerState.targetNoteId = note.id;
                    list.querySelectorAll('.move-task-item').forEach(function (el) {
                        el.classList.remove('selected');
                    });
                    item.classList.add('selected');
                    updatePickerConfirmState();
                });

                item.addEventListener('dblclick', function () {
                    pickerState.targetNoteId = note.id;
                    confirmPickerChoice();
                });

                list.appendChild(item);
            });
        }

        if (typeof window.poznoteAppendCreateTaskListRow === 'function') {
            window.poznoteAppendCreateTaskListRow(list, notes, searchQuery, function (created) {
                pickerState.targetNoteId = created.id;
                var searchInput = document.getElementById('taskListPickerSearchInput');
                loadPickerTargets(searchInput ? searchInput.value : '');
                updatePickerConfirmState();
            });
        }
    }

    function confirmPickerChoice() {
        if (!pickerState.targetNoteId) return;

        var picked = pickerState.notes.find(function (n) {
            return String(n.id) === String(pickerState.targetNoteId);
        });
        var target = {
            id: pickerState.targetNoteId,
            heading: picked ? (picked.heading || '') : ''
        };

        if (typeof closeModal === 'function') {
            closeModal('taskListPickerModal');
        } else {
            var modal = document.getElementById('taskListPickerModal');
            if (modal) modal.style.display = 'none';
        }

        if (pickerState.onPicked) {
            try {
                pickerState.onPicked(target);
            } catch (e) { }
        }
    }

    // ===== Wiring =====

    window.initializeTaskListEmbeds = initializeTaskListEmbeds;

    document.addEventListener('DOMContentLoaded', function () {
        initializeTaskListEmbeds();
    });

})();
