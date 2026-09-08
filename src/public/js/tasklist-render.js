// Task lists: rendering.

// Render the task list interface
function renderTaskList(noteId, tasks) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    const inputPlaceholder = window.t ? window.t('tasklist.input_placeholder', null, 'Write a new task and press enter to add it to the list...') : 'Write a new task and press enter to add it to the list...';

    const taskListHtml = `
        <div class="task-list-container" id="tasklist-${noteId}">
            <div class="tasklist-progress" id="tasklist-progress-${noteId}" style="display: none;">
                <div class="tasklist-progress-label"></div>
                <div class="tasklist-progress-bar">
                    <div class="tasklist-progress-fill"></div>
                </div>
            </div>
            <div class="task-input-container">
          <form class="task-input-form" id="task-input-form-${noteId}" action="javascript:void(0);">
              <input type="text" class="task-input" id="task-input-${noteId}"
                  placeholder="${escapeAttribute(inputPlaceholder)}" maxlength="4000"
                  autocomplete="off" enterkeyhint="go">
          </form>
            </div>
            <div class="tasks-list" id="tasks-list-${noteId}">
                ${renderTasks(tasks, noteId)}
            </div>
        </div>
    `;

    noteEntry.innerHTML = taskListHtml;
    noteEntry.contentEditable = false;

    // Add event listeners
    const input = document.getElementById(`task-input-${noteId}`);
    const form = document.getElementById(`task-input-form-${noteId}`);
    if (form) {
        // Implicit form submission is the only Enter mechanism that mobile
        // virtual keyboards trigger reliably (their keydown events often come
        // through IME composition with key 'Unidentified' instead of 'Enter',
        // so a keydown-only handler randomly misses the Enter key and the
        // browser moves focus to the next focusable element instead).
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            addTask(noteId);
        });
    }
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                // preventDefault also suppresses the implicit form submission,
                // so addTask is not called twice when keydown does fire.
                e.preventDefault();
                e.stopPropagation(); // Standardize event handling
                addTask(noteId);
            }
        });
        
        // Ensure pasted content is plain text only
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            // Insert plain text at cursor position
            const start = this.selectionStart;
            const end = this.selectionEnd;
            const currentValue = this.value;
            this.value = currentValue.substring(0, start) + text + currentValue.substring(end);
            // Move cursor to end of pasted text
            this.selectionStart = this.selectionEnd = start + text.length;
        });
    }

    // Store tasks data
    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

    // Enable drag & drop reordering after initial render
    enableDragAndDrop(noteId);

    updateTaskListProgress(noteId, tasks);
}

// Render individual tasks
function renderTasks(tasks, noteId) {
    if (!Array.isArray(tasks)) return '';

    const t = window.t || ((key, params, fallback) => fallback);

    return tasks.map(task => {
        const starClass = 'lucide lucide-star';
        const favBtnClass = task.important ? 'task-important-btn btn-favorite is-favorite' : 'task-important-btn btn-favorite';
        const title = task.important
            ? t('tasklist.unmark_important', null, 'Remove important')
            : t('tasklist.mark_important', null, 'Mark as important');
        const moveTitle = t('tasklist.move_to_list', null, 'Move to another list');
        const dueTitle = t('tasklist.due_date', null, 'Due date');
        const menuTitle = t('tasklist.task_options', null, 'Task options');
        const dragTitle = t('tasklist.drag_to_reorder', null, 'Drag to reorder');

        const dueAt = normalizeTaskDueAt(task.dueAt);
        const dueBellHtml = task.dueReminder ? '<i class="lucide lucide-bell"></i>' : '';
        const dueChipHtml = dueAt
            ? `<button type="button" class="task-due-chip${(!task.completed && isTaskDueOverdue(dueAt)) ? ' overdue' : ''}" title="${dueTitle}" onclick="openTaskDueDatePicker(${task.id}, ${task.noteId || 'null'}, event)">
                <i class="lucide lucide-calendar-alt"></i><span>${formatTaskDueDate(dueAt)}</span>${dueBellHtml}
            </button>`
            : '';
        const dueBtnHtml = (!dueAt && !task.completed)
            ? `<button class="task-due-btn" title="${dueTitle}" onclick="openTaskDueDatePicker(${task.id}, ${task.noteId || 'null'}, event)">
                <i class="lucide lucide-calendar-alt"></i>
            </button>`
            : '';

        // Conditional buttons based on completion status
        let buttonsHtml = '';
        if (task.completed) {
            // Completed tasks: show delete and drag buttons
            buttonsHtml = `
            <button class="task-delete-btn" onclick="deleteTask(${task.id}, ${task.noteId || 'null'})">
                <i class="lucide lucide-trash-2"></i>
            </button>
            <button class="task-move-btn" title="${moveTitle}" onclick="openMoveTaskModal(${task.id}, ${task.noteId || 'null'})">
                <i class="lucide-arrow-right"></i>
            </button>
            <div class="task-drag-handle" title="${dragTitle}">
                <i class="lucide-grip-vertical"></i>
            </div>`;
        } else {
            // Incomplete tasks: individual buttons on desktop, collapsed into a
            // three-dot menu on mobile (visibility handled in tasks.css)
            buttonsHtml = `
            ${dueBtnHtml}
            <button class="${favBtnClass}" title="${title}" onclick="toggleImportant(${task.id}, ${task.noteId || 'null'})">
                <i class="${starClass}"></i>
            </button>
            <button class="task-move-btn" title="${moveTitle}" onclick="openMoveTaskModal(${task.id}, ${task.noteId || 'null'})">
                <i class="lucide-arrow-right"></i>
            </button>
            <button class="task-menu-btn" title="${menuTitle}" onclick="openTaskActionsMenu(${task.id}, ${task.noteId || 'null'}, event)">
                <i class="lucide lucide-more-vertical"></i>
            </button>
            <div class="task-drag-handle" title="${dragTitle}">
                <i class="lucide-grip-vertical"></i>
            </div>`;
        }

        return `
        <div class="task-item ${task.completed ? 'completed' : ''} ${task.important ? 'important' : ''} ${dueAt ? 'has-due' : ''}" data-task-id="${task.id}" draggable="false">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id}, ${task.noteId || 'null'})">
            <span class="task-text" onclick="editTask(${task.id}, ${task.noteId || 'null'})">${linkifyHtml(task.text)}</span>
            ${dueChipHtml}
            <div class="task-row-actions">${buttonsHtml}</div>
        </div>
        `;
    }).join('');
}

// Cached tasklist insert order preference (global setting, rarely changes).
// Avoids a network round-trip on every task addition, which caused tasks to be
// added late or lost on mobile (slow network + race condition when adding
// several tasks quickly while a fetch was still in flight).
let cachedTasklistInsertOrder = null;

function refreshCachedTasklistInsertOrder() {
    fetch('/api/v1/settings/tasklist_insert_order', {
        method: 'GET',
        credentials: 'same-origin'
    })
        .then(r => r.json())
        .then(data => {
            if (data && data.success && (data.value === 'top' || data.value === 'bottom')) {
                cachedTasklistInsertOrder = data.value;
            } else if (cachedTasklistInsertOrder === null) {
                cachedTasklistInsertOrder = 'bottom';
            }
        })
        .catch(() => {
            if (cachedTasklistInsertOrder === null) cachedTasklistInsertOrder = 'bottom';
        });
}
