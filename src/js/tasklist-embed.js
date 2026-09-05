// Embedded task lists inside regular HTML notes.
//
// A note persists only a small marker:
//   <div class="tasklist-embed" data-task-embed="123" contenteditable="false">
//     <a class="tasklist-embed-link" href="index.php?note=123">Heading</a>
//   </div>
// The interactive widget rendered inside (.tasklist-embed-widget) is runtime
// UI: the server strips it on save (sanitizeHtml) and this file rebuilds it
// on load. The fallback link keeps public and exported notes usable.
//
// The widget is a live editor of the source tasklist note: tasks can be
// added, renamed (shared "Edit task" modal), completed, starred, dated and
// deleted without leaving the host note. Every change is a read-modify-write of the source note through
// the notes API (same flow as the global tasks page), so the host note never
// carries task data itself.
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

    function noteUrlFor(noteId) {
        return 'index.php?note=' + noteId
            + (currentWorkspace() ? '&workspace=' + encodeURIComponent(currentWorkspace()) : '');
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

    function findTask(tasks, taskId) {
        return tasks.find(function (item) { return String(item.id) === String(taskId); }) || null;
    }

    // The task may have been deleted from the tasklist note meanwhile
    function requireTask(tasks, taskId) {
        var task = findTask(tasks, taskId);
        if (!task) throw new Error('tasklist embed: task not found');
        return task;
    }

    // Per-list collapsed state, persisted per user (same pattern as the
    // dashboard tasks page)
    var COLLAPSED_KEY = 'poznote-tasklist-embed-collapsed';

    function getPrefsStorage() {
        return window.__poznoteUserStorage || window.localStorage;
    }

    function loadCollapsedListIds() {
        try {
            var parsed = JSON.parse(getPrefsStorage().getItem(COLLAPSED_KEY) || '[]');
            return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
        } catch (e) {
            return new Set();
        }
    }

    function saveCollapsedListIds(ids) {
        try {
            getPrefsStorage().setItem(COLLAPSED_KEY, JSON.stringify(Array.from(ids)));
        } catch (e) { }
    }

    // ===== Task ordering (mirrors the tasklist note and the tasks page) =====

    // Where new tasks go (global setting). Loaded once in the background so
    // adding a task never waits on a settings round-trip after the first one.
    var insertOrder = null;
    var insertOrderRequest = null;

    function loadInsertOrder() {
        if (insertOrderRequest) return insertOrderRequest;
        insertOrderRequest = fetch('/api/v1/settings/tasklist_insert_order', { credentials: 'same-origin' })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                insertOrder = (data && data.success && data.value === 'top') ? 'top' : 'bottom';
            })
            .catch(function () {
                if (insertOrder === null) insertOrder = 'bottom';
            });
        return insertOrderRequest;
    }

    function getInsertOrder() {
        return insertOrder === 'top' ? 'top' : 'bottom';
    }

    function groupTasks(tasks) {
        var important = [], normal = [], completed = [];
        tasks.forEach(function (task) {
            if (task.completed) completed.push(task);
            else if (task.important) important.push(task);
            else normal.push(task);
        });
        return { important: important, normal: normal, completed: completed };
    }

    // Important open tasks first, then the other open tasks, completed last
    function regroupTasks(tasks) {
        var groups = groupTasks(tasks);
        return [].concat(groups.important, groups.normal, groups.completed);
    }

    // A newly completed task lands at the top of the completed group (bottom
    // insert order) or at its end (top insert order); a reopened task rejoins
    // the end of its group
    function reorderAfterToggle(tasks, toggled) {
        var groups = groupTasks(tasks.filter(function (task) {
            return String(task.id) !== String(toggled.id);
        }));
        if (toggled.completed) {
            if (getInsertOrder() === 'bottom') groups.completed.unshift(toggled);
            else groups.completed.push(toggled);
        } else if (toggled.important) {
            groups.important.push(toggled);
        } else {
            groups.normal.push(toggled);
        }
        return [].concat(groups.important, groups.normal, groups.completed);
    }

    // ===== Source note access =====

    // Resolves to the tasklist note, or null when it is gone or not a task
    // list anymore. Network errors propagate.
    async function fetchTaskListNote(noteId) {
        var response = await fetch('/api/v1/notes/' + encodeURIComponent(noteId)
            + '?workspace=' + encodeURIComponent(currentWorkspace()), { credentials: 'same-origin' });
        var data = await response.json();
        if (!data || !data.success || !data.note || data.note.type !== 'tasklist') {
            return null;
        }
        return data.note;
    }

    async function saveTaskListNote(noteId, tasks) {
        var sessionId = editorSessionId();
        var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        var payload = { content: JSON.stringify(tasks) };
        if (sessionId) {
            headers['X-Editor-Session-ID'] = sessionId;
            payload.editor_session_id = sessionId;
        }

        var response = await fetch('/api/v1/notes/' + encodeURIComponent(noteId), {
            method: 'PATCH',
            headers: headers,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        var data = await response.json();
        if (!data || !data.success) {
            throw new Error('tasklist embed: save failed');
        }
    }

    // Read-modify-write of the source list: `mutate(tasks)` returns the new
    // task array (or null to leave the list untouched). Every embed of that
    // list on the page is re-rendered from the saved state afterwards.
    async function mutateTaskList(noteId, mutate) {
        var note = await fetchTaskListNote(noteId);
        if (!note) throw new Error('tasklist embed: target unavailable');

        var tasks = mutate(parseTasks(note.content));
        if (!tasks) return null;

        await saveTaskListNote(noteId, tasks);

        // The tasklist note may sit in the in-app DOM cache; drop it so
        // navigating there (e.g. via the widget title) shows fresh state
        if (typeof window.invalidateNoteDomCache === 'function') {
            window.invalidateNoteDomCache(noteId);
        }

        refreshEmbedsForNote(noteId);
        return tasks;
    }

    // Completing or deleting a task cancels its pending reminder
    function cancelTaskReminder(noteId, taskId) {
        fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/task-reminder', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ task_id: String(taskId) })
        }).catch(function () { });
    }

    function canOpenDueModal() {
        return typeof window.openTaskDueModal === 'function' && !!document.getElementById('taskDueModal');
    }

    // Transient error line under the widget (the edit lock of the source
    // note, a network failure...). The next re-render clears it.
    function showEmbedError(embed, message) {
        var widget = embed.querySelector(':scope > .tasklist-embed-widget');
        if (!widget) return;

        var box = widget.querySelector('.tasklist-embed-error');
        if (!box) {
            box = document.createElement('div');
            box.className = 'tasklist-embed-error';
            widget.appendChild(box);
        }
        box.textContent = message || t('tasklist_embed.save_error', null, 'Could not save the task list.');

        if (box._hideTimer) clearTimeout(box._hideTimer);
        box._hideTimer = setTimeout(function () { box.remove(); }, 5000);
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

        loadInsertOrder();

        try {
            var note = await fetchTaskListNote(noteId);
            if (!note) {
                renderUnavailable(embed);
                return;
            }
            renderWidget(embed, note, parseTasks(note.content));
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

    // A re-render (after any save) must not eat what the user is typing in
    // the "add a task" field of the widget being replaced
    function captureAddInputState(embed) {
        var input = embed.querySelector('.tasklist-embed-add-input');
        if (!input) return null;
        return {
            value: input.value,
            focused: document.activeElement === input,
            selectionStart: input.selectionStart,
            selectionEnd: input.selectionEnd
        };
    }

    function restoreAddInputState(widget, state) {
        if (!state) return;
        var input = widget.querySelector('.tasklist-embed-add-input');
        if (!input) return;
        input.value = state.value;
        if (state.focused) {
            input.focus();
            try {
                input.setSelectionRange(state.selectionStart, state.selectionEnd);
            } catch (e) { }
        }
    }

    function renderWidget(embed, note, tasks) {
        var noteId = note.id;
        var heading = note.heading || t('note_reference.untitled', null, 'Untitled');
        var noteUrl = noteUrlFor(noteId);

        // Keep the persisted fallback link in sync with the list's current name
        var fallback = embed.querySelector(':scope > .tasklist-embed-link');
        if (fallback) {
            fallback.textContent = heading;
            fallback.href = noteUrl;
        }

        var addState = captureAddInputState(embed);

        var widget = document.createElement('div');
        widget.className = 'tasklist-embed-widget';
        widget.setAttribute('contenteditable', 'false');

        var collapsedIds = loadCollapsedListIds();
        var isCollapsed = collapsedIds.has(String(noteId));
        if (isCollapsed) widget.classList.add('collapsed');

        var header = document.createElement('div');
        header.className = 'tasklist-embed-header';

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'tasklist-embed-toggle';
        toggle.title = isCollapsed
            ? t('tasks_page.expand', null, 'Expand')
            : t('tasks_page.collapse', null, 'Collapse');
        toggle.setAttribute('aria-expanded', String(!isCollapsed));
        toggle.innerHTML = '<i class="lucide lucide-chevron-down"></i>';
        toggle.addEventListener('click', function () {
            var nowCollapsed = widget.classList.toggle('collapsed');
            var ids = loadCollapsedListIds();
            if (nowCollapsed) {
                ids.add(String(noteId));
            } else {
                ids.delete(String(noteId));
            }
            saveCollapsedListIds(ids);
            toggle.title = nowCollapsed
                ? t('tasks_page.expand', null, 'Expand')
                : t('tasks_page.collapse', null, 'Collapse');
            toggle.setAttribute('aria-expanded', String(!nowCollapsed));
        });
        header.appendChild(toggle);

        // The title is the way to the source note (rows edit in place)
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

        var body = document.createElement('div');
        body.className = 'tasklist-embed-body';

        if (tasks.length > 0) {
            var list = document.createElement('div');
            list.className = 'tasklist-embed-list';
            tasks.forEach(function (task) {
                list.appendChild(renderTaskRow(embed, noteId, task));
            });
            body.appendChild(list);
        } else {
            var empty = document.createElement('div');
            empty.className = 'tasklist-embed-empty';
            empty.textContent = t('tasklist_embed.empty', null, 'No tasks in this list yet.');
            body.appendChild(empty);
        }

        body.appendChild(renderAddRow(embed, noteId));
        widget.appendChild(body);

        replaceWidget(embed, widget);
        restoreAddInputState(widget, addState);
    }

    function actionButton(icon, label, className, onClick) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'tasklist-embed-action ' + className;
        button.title = label;
        button.setAttribute('aria-label', label);

        var i = document.createElement('i');
        i.className = 'lucide ' + icon;
        button.appendChild(i);

        button.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });
        return button;
    }

    function renderTaskRow(embed, noteId, task) {
        var row = document.createElement('div');
        row.className = 'tasklist-embed-task'
            + (task.completed ? ' completed' : '')
            + (task.important && !task.completed ? ' important' : '');
        row.setAttribute('data-task-id', String(task.id));

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tasklist-embed-checkbox';
        checkbox.checked = !!task.completed;
        checkbox.addEventListener('change', function () {
            toggleEmbedTask(embed, noteId, task, checkbox);
        });
        row.appendChild(checkbox);

        // Click the text to rename the task (same modal as the tasklist note)
        var text = document.createElement('span');
        text.className = 'tasklist-embed-text';
        text.textContent = task.text || '';
        text.title = t('tasklist.edit_task', null, 'Edit task');
        text.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openEmbedEditModal(embed, noteId, task, text);
        });
        row.appendChild(text);

        if (task.dueAt) {
            var due = document.createElement(canOpenDueModal() ? 'button' : 'span');
            if (due.tagName === 'BUTTON') due.type = 'button';
            due.className = 'tasklist-embed-due' + (isOverdue(task) ? ' overdue' : '');
            due.title = t('tasklist.due_date', null, 'Due date');
            var dueIcon = document.createElement('i');
            dueIcon.className = 'lucide lucide-calendar-alt';
            due.appendChild(dueIcon);
            due.appendChild(document.createTextNode(formatDueDate(task.dueAt)));
            if (task.dueReminder) {
                var bell = document.createElement('i');
                bell.className = 'lucide lucide-bell';
                due.appendChild(bell);
            }
            due.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                openEmbedDueModal(embed, noteId, task);
            });
            row.appendChild(due);
        }

        // Same per-row controls as the tasklist note: open tasks get the due
        // date and important toggles, completed tasks can be deleted
        var actions = document.createElement('div');
        actions.className = 'tasklist-embed-actions';
        if (task.completed) {
            actions.appendChild(actionButton('lucide-trash-2', t('common.delete', null, 'Delete'),
                'tasklist-embed-action-delete', function () {
                    deleteEmbedTask(embed, noteId, task);
                }));
        } else {
            if (!task.dueAt && canOpenDueModal()) {
                actions.appendChild(actionButton('lucide-calendar-alt', t('tasklist.due_date', null, 'Due date'),
                    'tasklist-embed-action-due', function () {
                        openEmbedDueModal(embed, noteId, task);
                    }));
            }
            var starLabel = task.important
                ? t('tasklist.unmark_important', null, 'Remove important')
                : t('tasklist.mark_important', null, 'Mark as important');
            actions.appendChild(actionButton('lucide-star', starLabel,
                'tasklist-embed-action-important' + (task.important ? ' is-active' : ''), function () {
                    toggleEmbedImportant(embed, noteId, task);
                }));
        }
        row.appendChild(actions);

        return row;
    }

    // "Add a task" field at the bottom of the list
    function renderAddRow(embed, noteId) {
        var form = document.createElement('form');
        form.className = 'tasklist-embed-add';
        form.setAttribute('action', 'javascript:void(0);');

        var icon = document.createElement('i');
        icon.className = 'lucide lucide-plus';
        form.appendChild(icon);

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'tasklist-embed-add-input';
        input.placeholder = t('tasklist_embed.add_placeholder', null, 'Add a task...');
        input.maxLength = 4000;
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('enterkeyhint', 'go');
        form.appendChild(input);

        function submitAdd() {
            var text = input.value.trim();
            if (!text) return;

            // Clear right away so the next task can be typed while this one
            // saves; the value comes back if the save fails
            input.value = '';
            addEmbedTask(embed, noteId, text).catch(function () {
                var current = embed.querySelector('.tasklist-embed-add-input');
                if (current && !current.value) current.value = text;
                showEmbedError(embed);
            });
            input.focus();
        }

        // Implicit form submission is what mobile virtual keyboards trigger
        // reliably (see tasklist.js); the keydown handler covers desktop
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            submitAdd();
        });
        input.addEventListener('keydown', function (e) {
            // Keys typed here belong to this field: the host note editor's
            // keydown handlers (Enter/Tab/Backspace logic, shortcuts) must
            // not act on them
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                submitAdd();
            }
        });

        return form;
    }

    // Rename through the shared "Edit task" modal of tasklist.js (multi-line
    // text, Ctrl+Enter saves); the modal hands the new text back and the
    // widget persists it itself
    function openEmbedEditModal(embed, noteId, task, textEl) {
        if (typeof window.openTaskEditModal !== 'function') return;

        var original = task.text || '';
        window.openTaskEditModal(task.id, noteId, original, textEl, {
            onSave: function (newText) {
                textEl.textContent = newText;
                saveEmbedTaskText(embed, noteId, task, newText, original, textEl);
            }
        });
    }

    // ===== Mutations =====

    async function toggleEmbedTask(embed, noteId, task, checkbox) {
        var newCompleted = checkbox.checked;
        checkbox.disabled = true;

        var clearReminder = false;
        try {
            await mutateTaskList(noteId, function (tasks) {
                var target = requireTask(tasks, task.id);
                target.completed = newCompleted;
                clearReminder = newCompleted && !!target.dueReminder;
                if (clearReminder) target.dueReminder = false;
                return reorderAfterToggle(tasks, target);
            });
            if (clearReminder) cancelTaskReminder(noteId, task.id);
        } catch (e) {
            checkbox.checked = !newCompleted;
            checkbox.disabled = false;
            showEmbedError(embed);
        }
    }

    async function addEmbedTask(embed, noteId, text) {
        await loadInsertOrder();
        await mutateTaskList(noteId, function (tasks) {
            var groups = groupTasks(tasks);
            var task = {
                id: Date.now() + Math.random(),
                text: text,
                completed: false,
                noteId: Number(noteId) || noteId,
                important: false,
                dueAt: null
            };
            if (getInsertOrder() === 'top') {
                groups.normal.unshift(task);
            } else {
                groups.normal.push(task);
            }
            return [].concat(groups.important, groups.normal, groups.completed);
        });
    }

    async function saveEmbedTaskText(embed, noteId, task, newText, originalText, textEl) {
        try {
            await mutateTaskList(noteId, function (tasks) {
                requireTask(tasks, task.id).text = newText;
                return tasks;
            });
        } catch (e) {
            textEl.textContent = originalText;
            showEmbedError(embed);
        }
    }

    async function deleteEmbedTask(embed, noteId, task) {
        var hadReminder = false;
        try {
            await mutateTaskList(noteId, function (tasks) {
                var target = requireTask(tasks, task.id);
                hadReminder = !!target.dueReminder;
                return tasks.filter(function (item) { return item !== target; });
            });
            if (hadReminder) cancelTaskReminder(noteId, task.id);
        } catch (e) {
            showEmbedError(embed);
        }
    }

    async function toggleEmbedImportant(embed, noteId, task) {
        try {
            await mutateTaskList(noteId, function (tasks) {
                var target = requireTask(tasks, task.id);
                target.important = !target.important;
                return regroupTasks(tasks);
            });
        } catch (e) {
            showEmbedError(embed);
        }
    }

    // Shared due-date modal (date + time + reminder). The modal materializes
    // the reminder itself once onSave resolved, so a failed save must reject
    // to keep the reminder in step with the stored due date.
    function openEmbedDueModal(embed, noteId, task) {
        if (!canOpenDueModal()) return;

        window.openTaskDueModal({
            noteId: noteId,
            taskId: task.id,
            task: task,
            onSave: function (payload) {
                return mutateTaskList(noteId, function (tasks) {
                    var target = requireTask(tasks, task.id);
                    target.dueAt = payload.dueAt;
                    target.dueReminder = payload.dueReminder;
                    target.dueReminderEmail = payload.dueReminderEmail;
                    target.dueRecurrence = payload.dueRecurrence;
                    return tasks;
                }).catch(function (e) {
                    showEmbedError(embed);
                    throw e;
                });
            }
        });
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

        // No autofocus on mobile: it would pop the virtual keyboard over the
        // freshly opened modal. The note editor also keeps focus when opened
        // from the slash menu, so blur it or the keyboard stays open.
        if (window.innerWidth <= 800) {
            setTimeout(function () {
                var active = document.activeElement;
                if (active && active !== document.body && !modal.contains(active)
                    && typeof active.blur === 'function') {
                    active.blur();
                }
            }, 0);
        } else if (searchInput) {
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
