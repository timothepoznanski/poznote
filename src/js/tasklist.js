// Task List Management Functions

// Initialize task list for a note
function initializeTaskList(noteId, noteType) {
    if (noteType !== 'tasklist') return;

    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    // Get existing tasks from the note content or initialize empty array
    let tasks = [];
    try {
        const content = noteEntry.textContent || noteEntry.innerHTML || '';
        if (content.trim()) {
            tasks = JSON.parse(content.trim());
        }
    } catch (e) {
        // If content is not valid JSON, try to parse as simple text tasks
        const content = noteEntry.textContent || noteEntry.innerHTML || '';
        if (content.trim()) {
            tasks = content.split('\n').filter(task => task.trim()).map(task => ({
                id: Date.now() + Math.random(),
                text: task.replace(/^[-*]\s*/, '').trim(),
                completed: false
            }));
        }
    }

    // Replace the contenteditable div with task list interface
    renderTaskList(noteId, tasks);
}

// Render the task list interface
function renderTaskList(noteId, tasks) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    const taskListHtml = `
        <div class="task-list-container" id="tasklist-${noteId}">
            <div class="task-input-container">
                <input type="text" class="task-input" id="task-input-${noteId}"
                       placeholder="Add new task..." maxlength="200">
                <button class="task-add-btn" onclick="addTask(${noteId})">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
            <div class="tasks-list" id="tasks-list-${noteId}">
                ${renderTasks(tasks)}
            </div>
        </div>
    `;

    noteEntry.innerHTML = taskListHtml;
    noteEntry.contentEditable = false;

    // Add event listeners
    const input = document.getElementById(`task-input-${noteId}`);
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addTask(noteId);
            }
        });
    }

    // Store tasks data
    noteEntry.dataset.tasks = JSON.stringify(tasks);
}

// Render individual tasks
function renderTasks(tasks) {
    if (!Array.isArray(tasks)) return '';

    return tasks.map(task => {
        const starClass = task.important ? 'fas fa-star' : 'far fa-star';
        const favBtnClass = task.important ? 'task-important-btn btn-favorite is-favorite' : 'task-important-btn btn-favorite';
        const title = task.important ? 'Remove important' : 'Mark as important';
        return `
        <div class="task-item ${task.completed ? 'completed' : ''} ${task.important ? 'important' : ''}" data-task-id="${task.id}">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id}, ${task.noteId || 'null'})">
            <span class="task-text" onclick="editTask(${task.id}, ${task.noteId || 'null'})">${escapeHtml(task.text)}</span>
            <button class="${favBtnClass}" title="${title}" onclick="toggleImportant(${task.id}, ${task.noteId || 'null'})">
                <i class="${starClass}"></i>
            </button>
            <button class="task-delete-btn" onclick="deleteTask(${task.id}, ${task.noteId || 'null'})">
                <i class="fas fa-trash"></i>
            </button>
        </div>
        `;
    }).join('');
}

// Add a new task
function addTask(noteId) {
    const input = document.getElementById(`task-input-${noteId}`);
    if (!input) return;

    const taskText = input.value.trim();
    if (!taskText) return;

    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasks || '[]');
    } catch (e) {
        tasks = [];
    }

    const newTask = {
        id: Date.now() + Math.random(),
        text: taskText,
        completed: false,
        noteId: noteId
    };

    // default important flag
    newTask.important = false;

    tasks.push(newTask);
    noteEntry.dataset.tasks = JSON.stringify(tasks);

    // Re-render tasks
    const tasksList = document.getElementById(`tasks-list-${noteId}`);
    if (tasksList) {
        tasksList.innerHTML = renderTasks(tasks);
    }

    // Clear input
    input.value = '';

    // Mark as modified
    markNoteAsModified(noteId);
}

// Toggle task completion
function toggleTask(taskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasks || '[]');
    } catch (e) {
        return;
    }

    const taskIndex = tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) return;

    tasks[taskIndex].completed = !tasks[taskIndex].completed;
    noteEntry.dataset.tasks = JSON.stringify(tasks);

    // Update UI
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskItem) {
        taskItem.classList.toggle('completed');
    }

    markNoteAsModified(noteId);
}

// Edit task text
function editTask(taskId, noteId) {
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskItem) return;

    const taskText = taskItem.querySelector('.task-text');
    if (!taskText) return;

    const currentText = taskText.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'task-edit-input';
    input.maxLength = 200;

    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveTaskEdit(taskId, noteId, input.value.trim());
        } else if (e.key === 'Escape') {
            cancelTaskEdit(taskId, noteId, currentText);
        }
    });

    input.addEventListener('blur', function() {
        saveTaskEdit(taskId, noteId, input.value.trim());
    });

    taskText.replaceWith(input);
    input.focus();
    input.select();
}

// Save task edit
function saveTaskEdit(taskId, noteId, newText) {
    if (!newText) return;

    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasks || '[]');
    } catch (e) {
        return;
    }

    const taskIndex = tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) return;

    tasks[taskIndex].text = newText;
    noteEntry.dataset.tasks = JSON.stringify(tasks);

    // Re-render task
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskItem) {
        const taskText = taskItem.querySelector('.task-text') || taskItem.querySelector('.task-edit-input');
        if (taskText) {
            const newTaskText = document.createElement('span');
            newTaskText.className = 'task-text';
            newTaskText.textContent = newText;
            newTaskText.onclick = () => editTask(taskId, noteId);
            taskText.replaceWith(newTaskText);
        }
    }

    markNoteAsModified(noteId);
}

// Cancel task edit
function cancelTaskEdit(taskId, noteId, originalText) {
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskItem) return;

    const input = taskItem.querySelector('.task-edit-input');
    if (!input) return;

    const taskText = document.createElement('span');
    taskText.className = 'task-text';
    taskText.textContent = originalText;
    taskText.onclick = () => editTask(taskId, noteId);
    input.replaceWith(taskText);
}

// Delete task
function deleteTask(taskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasks || '[]');
    } catch (e) {
        return;
    }

    tasks = tasks.filter(task => task.id !== taskId);
    noteEntry.dataset.tasks = JSON.stringify(tasks);

    // Remove from UI
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskItem) {
        taskItem.remove();
    }

    markNoteAsModified(noteId);
}

// Toggle important flag for a task and move it to top when important
function toggleImportant(taskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasks || '[]');
    } catch (e) {
        return;
    }

    const taskIndex = tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) return;

    // Toggle flag
    tasks[taskIndex].important = !tasks[taskIndex].important;

    // Reorder: important tasks first (keep relative order otherwise)
    tasks.sort((a, b) => {
        if ((a.important ? 1 : 0) === (b.important ? 1 : 0)) return 0;
        return (b.important ? 1 : 0) - (a.important ? 1 : 0);
    });

    noteEntry.dataset.tasks = JSON.stringify(tasks);

    // Re-render tasks list
    const tasksList = document.getElementById(`tasks-list-${noteId}`);
    if (tasksList) {
        tasksList.innerHTML = renderTasks(tasks);
    }

    markNoteAsModified(noteId);
}

// Mark note as modified (to trigger save)
function markNoteAsModified(noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (noteEntry) {
        // Trigger the existing save mechanism
        editedButNotSaved = 1;
        updateident(noteEntry);
        setSaveButtonRed(true);
    }
}

// Get task list data for saving
function getTaskListData(noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return '';

    try {
        const tasks = JSON.parse(noteEntry.dataset.tasks || '[]');
        return JSON.stringify(tasks);
    } catch (e) {
        return '';
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export functions globally
window.initializeTaskList = initializeTaskList;
window.addTask = addTask;
window.toggleTask = toggleTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.getTaskListData = getTaskListData;
window.toggleImportant = toggleImportant;