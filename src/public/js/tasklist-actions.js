// Task lists: per-task actions.
// 
// Deleting, marking important, setting a due date, and the per-task actions menu.

// Delete task
function deleteTask(taskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = parseTaskData(noteEntry);

    const removedTask = tasks.find(task => task.id === taskId);
    clearTaskReminderIfAny(noteId, removedTask);

    tasks = tasks.filter(task => task.id !== taskId);
    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

    // Remove from UI
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskItem) {
        taskItem.remove();
    }

    // Ensure DnD state is consistent after deletion
    enableDragAndDrop(noteId);

    updateTaskListProgress(noteId, tasks);

    markTaskListAsModified(noteId);
}

// Toggle important flag for a task and move it to top when important
function toggleImportant(taskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = parseTaskData(noteEntry);

    const taskIndex = tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) return;

    // Toggle flag
    tasks[taskIndex].important = !tasks[taskIndex].important;

    // Reorder: important incomplete → normal incomplete → completed
    const { important, normal, completed } = groupTasksByStatus(tasks);
    tasks = [].concat(important, normal, completed);

    saveAndRenderTasks(noteId, tasks);

    markTaskListAsModified(noteId);
}

// Open the calendar popup to set or clear a task's due date
function openTaskDueDatePicker(taskId, noteId, event, anchorRectOverride) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (isPublicWorkspaceReadOnly()) return;

    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    const tasks = parseTaskData(noteEntry);
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    const setDueAt = function (value) {
        task.dueAt = value;
        saveAndRenderTasks(noteId, tasks);
        markTaskListAsModified(noteId);
    };

    const trigger = event && event.target ? event.target.closest('button') : null;
    const anchorRect = anchorRectOverride || (trigger ? trigger.getBoundingClientRect() : null);

    // Preferred UI: the shared due-date modal (date + time + reminder toggle)
    if (typeof window.openTaskDueModal === 'function' && document.getElementById('taskDueModal')) {
        window.openTaskDueModal({
            noteId: noteId,
            taskId: task.id,
            task: task,
            onSave: function (payload) {
                task.dueAt = payload.dueAt;
                task.dueReminder = payload.dueReminder;
                task.dueReminderEmail = payload.dueReminderEmail;
                task.dueRecurrence = payload.dueRecurrence;
                saveAndRenderTasks(noteId, tasks);
                markTaskListAsModified(noteId);
            }
        });
        return;
    }

    if (typeof window.showSlashDatePicker === 'function') {
        const removeLabel = window.t ? window.t('tasklist.due_remove', null, 'Remove due date') : 'Remove due date';
        const normalizedDue = normalizeTaskDueAt(task.dueAt);
        const pickerOptions = {
            withTime: true,
            initialTime: taskDueTimePart(task.dueAt),
            initialDate: normalizedDue ? normalizedDue.substring(0, 10) : null,
            removeTimeLabel: window.t ? window.t('tasklist.due_remove_time', null, 'Remove time') : 'Remove time'
        };
        if (task.dueAt) {
            pickerOptions.removeLabel = removeLabel;
            pickerOptions.onRemove = function () { setDueAt(null); };
        }
        window.showSlashDatePicker(anchorRect, function (date, time) {
            const day = date.getFullYear() + '-'
                + String(date.getMonth() + 1).padStart(2, '0') + '-'
                + String(date.getDate()).padStart(2, '0');
            setDueAt(time ? (day + 'T' + time) : day);
        }, null, pickerOptions);
        return;
    }

    // Fallback when slash-command.js is not loaded on this page
    const input = document.createElement('input');
    input.type = 'date';
    input.value = normalizeTaskDueAt(task.dueAt) || '';
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
        setDueAt(normalizeTaskDueAt(input.value));
        input.remove();
    });
    input.addEventListener('blur', function () { input.remove(); });
    try {
        if (typeof input.showPicker === 'function') input.showPicker();
        else input.click();
    } catch (e) {
        input.remove();
    }
}

window.openTaskDueDatePicker = openTaskDueDatePicker;

// Small popup menu with the actions of an incomplete task (due date,
// important, move). Shown from the three-dot button on mobile.
let taskActionsMenuCleanup = null;

function closeTaskActionsMenu() {
    if (taskActionsMenuCleanup) taskActionsMenuCleanup();
}

function openTaskActionsMenu(taskId, noteId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    closeTaskActionsMenu();

    if (isPublicWorkspaceReadOnly()) return;

    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    const tasks = parseTaskData(noteEntry);
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;

    const t = window.t || ((key, params, fallback) => fallback);
    const trigger = event && event.target ? event.target.closest('button') : null;
    const anchorRect = trigger ? trigger.getBoundingClientRect() : null;

    const items = [
        {
            icon: 'lucide lucide-calendar-alt',
            label: t('tasklist.due_date', null, 'Due date'),
            run: function () {
                openTaskDueDatePicker(taskId, noteId, null, anchorRect);
            }
        },
        {
            icon: 'lucide lucide-star',
            label: task.important
                ? t('tasklist.unmark_important', null, 'Remove important')
                : t('tasklist.mark_important', null, 'Mark as important'),
            run: function () {
                toggleImportant(taskId, noteId);
            }
        },
        {
            icon: 'lucide lucide-arrow-right',
            label: t('tasklist.move_to_list', null, 'Move to another list'),
            run: function () {
                openMoveTaskModal(taskId, noteId);
            }
        }
    ];

    const menu = document.createElement('div');
    menu.className = 'task-actions-menu';

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'task-actions-menu-item';
        const icon = document.createElement('i');
        icon.className = item.icon;
        btn.appendChild(icon);
        btn.appendChild(document.createTextNode(item.label));
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            cleanup();
            item.run();
        });
        menu.appendChild(btn);
    });

    function cleanup() {
        document.removeEventListener('mousedown', handleOutsideMouseDown, true);
        document.removeEventListener('keydown', handleEscape, true);
        if (menu.parentNode) menu.parentNode.removeChild(menu);
        taskActionsMenuCleanup = null;
    }

    function handleOutsideMouseDown(e) {
        if (!menu.contains(e.target)) cleanup();
    }

    function handleEscape(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cleanup();
        }
    }

    document.body.appendChild(menu);

    const padding = 8;
    const menuRect = menu.getBoundingClientRect();
    const rect = anchorRect || { left: (window.innerWidth - menuRect.width) / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
    const x = Math.min(rect.left, window.innerWidth - menuRect.width - padding);
    let y = rect.bottom + 6;
    if (y + menuRect.height > window.innerHeight - padding) {
        y = Math.max(padding, rect.top - menuRect.height - 6);
    }
    menu.style.left = Math.max(padding, x) + 'px';
    menu.style.top = y + 'px';

    document.addEventListener('mousedown', handleOutsideMouseDown, true);
    document.addEventListener('keydown', handleEscape, true);

    taskActionsMenuCleanup = cleanup;
}

window.openTaskActionsMenu = openTaskActionsMenu;
