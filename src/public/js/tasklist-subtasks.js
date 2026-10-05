// Task lists: subtasks.
//
// One level of checkable items under a task, stored in the task's own `subtasks`
// array as {id, text, completed}. They live inside the task, so they follow it through
// regrouping, drag and drop, a move to another list and deletion. A subtask has no
// due date, reminder or important flag, and ticking one never ticks its task.

// Clean the stored subtasks of a task: numeric ids that are unique in the task (the
// inline handlers of the rows address a subtask by id), boolean completion, text.
function normalizeSubtasks(subtasks) {
    if (!Array.isArray(subtasks)) return [];

    const seen = new Set();
    const normalized = [];

    subtasks.forEach(subtask => {
        if (!subtask || typeof subtask !== 'object') return;

        const text = typeof subtask.text === 'string' ? subtask.text : String(subtask.text ?? '');
        if (!text.trim()) return;

        let id = (typeof subtask.id === 'number' && isFinite(subtask.id)) ? subtask.id : parseFloat(subtask.id);
        if (isNaN(id) || !isFinite(id) || seen.has(id)) {
            do {
                id = Date.now() + Math.random();
            } while (seen.has(id));
        }
        seen.add(id);

        normalized.push({ ...subtask, id: id, text: text, completed: !!subtask.completed });
    });

    return normalized;
}

function getTaskSubtasks(task) {
    return (task && Array.isArray(task.subtasks)) ? task.subtasks : [];
}

function renderSubtaskRows(task, noteId) {
    const t = window.t || ((key, params, fallback) => fallback);
    const deleteTitle = escapeAttribute(t('tasklist.delete_subtask', null, 'Delete subtask'));

    return getTaskSubtasks(task).map(subtask => `
            <div class="task-subitem ${subtask.completed ? 'completed' : ''}" data-subtask-id="${subtask.id}">
                <input type="checkbox" class="task-subitem-checkbox" ${subtask.completed ? 'checked' : ''} onchange="toggleSubtask(${task.id}, ${subtask.id}, ${noteId})">
                <span class="task-subitem-text" onclick="editSubtask(${task.id}, ${subtask.id}, ${noteId})">${linkifyHtml(subtask.text)}</span>
                <button type="button" class="task-subitem-delete" title="${deleteTitle}" onclick="deleteSubtask(${task.id}, ${subtask.id}, ${noteId})">
                    <i class="lucide lucide-x"></i>
                </button>
            </div>`).join('');
}

// Subtask block of a task row; nothing when the task has none
function renderSubtasks(task, noteId) {
    if (getTaskSubtasks(task).length === 0) return '';
    return `<div class="task-subtasks">${renderSubtaskRows(task, noteId)}</div>`;
}

function findTaskItemElement(noteId, taskId) {
    const tasksList = document.getElementById('tasks-list-' + noteId);
    return tasksList ? tasksList.querySelector('.task-item[data-task-id="' + taskId + '"]') : null;
}

// Redraw the subtasks of one task in place. A full renderTasks() would close the
// "add a subtask" field the user may be typing in.
function refreshTaskSubtasks(noteId, task) {
    const item = findTaskItemElement(noteId, task.id);
    if (!item) return;

    let container = item.querySelector('.task-subtasks');
    const hasForm = !!(container && container.querySelector('.task-subitem-form'));
    const hasSubtasks = getTaskSubtasks(task).length > 0;

    if (!hasSubtasks && !hasForm) {
        if (container) container.remove();
        item.classList.remove('has-subtasks');
    } else {
        if (!container) {
            container = document.createElement('div');
            container.className = 'task-subtasks';
            item.appendChild(container);
        }
        item.classList.add('has-subtasks');
        container.querySelectorAll('.task-subitem').forEach(row => row.remove());
        container.insertAdjacentHTML('afterbegin', renderSubtaskRows(task, noteId));

        // Process references [[Note Title]] in the newly rendered rows
        if (typeof window.processNoteReferences === 'function') {
            const workspace = typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : (window.selectedWorkspace || '');
            window.processNoteReferences(container, workspace);
        }
    }
}

// Apply a change to the subtasks of one task, then store, redraw and save.
// `mutate(task)` returns false to leave the list untouched.
function updateTaskSubtasks(taskId, noteId, mutate) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return null;

    const tasks = parseTaskData(noteEntry);
    const task = tasks.find(item => String(item.id) === String(taskId));
    if (!task) return null;

    if (!Array.isArray(task.subtasks)) task.subtasks = [];
    const changed = mutate(task) !== false;
    if (task.subtasks.length === 0) delete task.subtasks;
    if (!changed) return task;

    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);
    refreshTaskSubtasks(noteId, task);
    markTaskListAsModified(noteId);

    return task;
}

function addSubtask(taskId, noteId, text) {
    const subtaskText = String(text || '').trim();
    if (!subtaskText) return;

    updateTaskSubtasks(taskId, noteId, task => {
        task.subtasks.push({
            id: Date.now() + Math.random(),
            text: subtaskText,
            completed: false
        });
    });
}

function toggleSubtask(taskId, subtaskId, noteId) {
    updateTaskSubtasks(taskId, noteId, task => {
        const subtask = task.subtasks.find(item => String(item.id) === String(subtaskId));
        if (!subtask) return false;
        subtask.completed = !subtask.completed;
    });
}

function deleteSubtask(taskId, subtaskId, noteId) {
    updateTaskSubtasks(taskId, noteId, task => {
        const index = task.subtasks.findIndex(item => String(item.id) === String(subtaskId));
        if (index === -1) return false;
        task.subtasks.splice(index, 1);
    });
}

function saveSubtaskEdit(taskId, subtaskId, noteId, newText) {
    const subtaskText = String(newText || '').trim();
    if (!subtaskText) return;

    updateTaskSubtasks(taskId, noteId, task => {
        const subtask = task.subtasks.find(item => String(item.id) === String(subtaskId));
        if (!subtask || subtask.text === subtaskText) return false;
        subtask.text = subtaskText;
    });
}

// Rename a subtask through the shared "Edit task" modal
function editSubtask(taskId, subtaskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    const task = parseTaskData(noteEntry).find(item => String(item.id) === String(taskId));
    const subtask = getTaskSubtasks(task).find(item => String(item.id) === String(subtaskId));
    if (!subtask) return;

    const item = findTaskItemElement(noteId, taskId);
    const textEl = item ? item.querySelector('.task-subitem[data-subtask-id="' + subtaskId + '"] .task-subitem-text') : null;

    const opened = openTaskEditModal(subtaskId, noteId, subtask.text, textEl, {
        onSave: function (newText) {
            saveSubtaskEdit(taskId, subtaskId, noteId, newText);
        }
    });
    if (opened || !textEl) return;

    // No modal on this page: edit in place
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-subitem-input';
    input.value = subtask.text;
    input.maxLength = 4000;

    let done = false;
    const finish = function (save) {
        if (done) return;
        done = true;
        const newText = input.value.trim();
        if (save && newText && newText !== subtask.text) {
            saveSubtaskEdit(taskId, subtaskId, noteId, newText);
        } else if (input.isConnected) {
            input.replaceWith(textEl);
        }
    };

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            finish(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finish(false);
        }
    });
    input.addEventListener('blur', function () { finish(true); });

    textEl.replaceWith(input);
    input.focus();
    input.select();
}

// Show the "add a subtask" field under a task. It stays open after each addition so
// several subtasks can be typed in a row; Escape or leaving it empty closes it.
// Like the new-task field, it opens the slash menu (js/slash-command.js): link to a
// note, emoji, date.
function openSubtaskInput(taskId, noteId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const item = findTaskItemElement(noteId, taskId);
    if (!item) return;

    let container = item.querySelector('.task-subtasks');
    if (!container) {
        container = document.createElement('div');
        container.className = 'task-subtasks';
        item.appendChild(container);
        item.classList.add('has-subtasks');
    }

    let form = container.querySelector('.task-subitem-form');
    if (form) {
        form.querySelector('.task-subitem-input').focus();
        return;
    }

    const placeholder = window.t ? window.t('tasklist.subtask_placeholder', null, 'Add a subtask...') : 'Add a subtask...';

    form = document.createElement('form');
    form.className = 'task-subitem-form';
    form.setAttribute('action', 'javascript:void(0);');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-subitem-input';
    input.placeholder = placeholder;
    input.maxLength = 4000;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('enterkeyhint', 'go');
    form.appendChild(input);

    function closeInput() {
        form.remove();
        const noteEntry = document.getElementById('entry' + noteId);
        const task = noteEntry
            ? parseTaskData(noteEntry).find(entry => String(entry.id) === String(taskId))
            : null;
        if (getTaskSubtasks(task).length === 0) {
            container.remove();
            item.classList.remove('has-subtasks');
        }
    }

    function submit() {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        addSubtask(taskId, noteId, text);
        input.focus();
    }

    // Implicit form submission is the Enter mechanism mobile keyboards trigger
    // reliably (see renderTaskList in tasklist-render.js)
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        submit();
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            submit();
        } else if (e.key === 'Escape') {
            // Already handled: it closed the slash menu of the field
            if (e.defaultPrevented) return;
            e.preventDefault();
            e.stopPropagation();
            closeInput();
        }
    });
    input.addEventListener('blur', function () {
        // Left empty: the field goes away. Deferred so a click on another control
        // of the row (its handler may redraw the list) is not cut short. It stays
        // while a picker of its slash menu (link to note, emoji, date) has the focus.
        setTimeout(function () {
            if (isTaskEditBlurSavePaused(input)) return;
            if (form.isConnected && document.activeElement !== input && !input.value.trim()) closeInput();
        }, 150);
    });

    // Ensure pasted content is plain text only
    input.addEventListener('paste', function (e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/[\r\n]+/g, ' ');
        const start = this.selectionStart;
        const end = this.selectionEnd;
        this.value = this.value.substring(0, start) + text + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + text.length;
    });

    container.appendChild(form);
    input.focus();
}

window.addSubtask = addSubtask;
window.toggleSubtask = toggleSubtask;
window.editSubtask = editSubtask;
window.deleteSubtask = deleteSubtask;
window.openSubtaskInput = openSubtaskInput;
