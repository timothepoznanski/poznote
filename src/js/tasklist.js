// Task List Management Functions

// Initialize task list for a note
function initializeTaskList(noteId, noteType) {
    if (noteType !== 'tasklist') return;

    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    // Get existing tasks from the data attribute or initialize empty array
    let tasks = [];
    const tasklistJson = noteEntry.dataset.tasklistJson;
    
    if (tasklistJson && tasklistJson.trim() !== '') {
        // Check if it looks like JSON (starts with [ or {)
        const trimmed = tasklistJson.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                tasks = JSON.parse(tasklistJson);
            } catch (e) {
                console.error('Failed to parse tasklist JSON:', e);
                console.error('Problematic JSON content:', tasklistJson);
                // Initialize empty task list on parse error
                tasks = [];
            }
        } else {
            // Try to extract tasks from existing HTML if present
            tasks = extractTasksFromHTML(noteEntry) || [];
        }
    }

    // Normalize task data (ensure numeric IDs and correct noteId)
    const normalizeTaskId = (value) => {
        if (typeof value === 'number' && isFinite(value)) return value;
        if (typeof value === 'string') {
            const num = parseFloat(value);
            if (!isNaN(num) && isFinite(num)) return num;
        }
        return Date.now() + Math.random();
    };

    tasks = tasks.map(task => {
        if (!task || typeof task !== 'object') {
            return {
                id: Date.now() + Math.random(),
                text: '',
                completed: false,
                noteId: noteId,
                important: false
            };
        }

        return {
            ...task,
            id: normalizeTaskId(task.id),
            noteId: noteId,
            completed: !!task.completed,
            important: !!task.important,
            text: typeof task.text === 'string' ? task.text : String(task.text ?? '')
        };
    });

    // Persist normalized data for subsequent actions
    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

    // Replace the contenteditable div with task list interface
    renderTaskList(noteId, tasks);
}

// Extract tasks from existing HTML (recovery function)
function extractTasksFromHTML(noteEntry) {
    try {
        const taskItems = noteEntry.querySelectorAll('.task-item');
        if (taskItems.length === 0) return null;
        
        const tasks = [];
        taskItems.forEach(item => {
            const taskId = item.dataset.taskId;
            const textSpan = item.querySelector('.task-text');
            const checkbox = item.querySelector('.task-checkbox');
            const importantBtn = item.querySelector('.task-important-btn');
            
            if (taskId && textSpan) {
                tasks.push({
                    id: parseFloat(taskId) || Date.now() + Math.random(),
                    text: textSpan.textContent || '',
                    completed: checkbox ? checkbox.checked : false,
                    noteId: parseInt(noteEntry.id.replace('entry', '')),
                    important: importantBtn ? importantBtn.classList.contains('important') : false
                });
            }
        });
        
        return tasks.length > 0 ? tasks : null;
    } catch (e) {
        console.error('Error extracting tasks from HTML:', e);
        return null;
    }
}

// Render the task list interface
function renderTaskList(noteId, tasks) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    const taskListHtml = `
        <div class="task-list-container" id="tasklist-${noteId}">
            <div class="task-input-container">
          <input type="text" class="task-input" id="task-input-${noteId}"
              placeholder="${window.t ? window.t('tasklist.input_placeholder', null, 'Write a new task and press enter to add it to the list...') : 'Write a new task and press enter to add it to the list...'}" maxlength="4000">
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
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
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
}

// Render individual tasks
function renderTasks(tasks, noteId) {
    if (!Array.isArray(tasks)) return '';

    return tasks.map(task => {
        const starClass = 'fa-star';
        const favBtnClass = task.important ? 'task-important-btn btn-favorite is-favorite' : 'task-important-btn btn-favorite';
        const title = task.important ? 'Remove important' : 'Mark as important';
        
        // Conditional buttons based on completion status
        let buttonsHtml = '';
        if (task.completed) {
            // Completed tasks: show delete and drag buttons
            buttonsHtml = `
            <button class="task-delete-btn" onclick="deleteTask(${task.id}, ${task.noteId || 'null'})">
                <i class="fa-trash"></i>
            </button>
            <div class="task-drag-handle" title="${window.t ? window.t('tasklist.drag_to_reorder', null, 'Drag to reorder') : 'Drag to reorder'}">
                <i class="fa-grip-vertical"></i>
            </div>`;
        } else {
            // Incomplete tasks: show favorite and drag buttons
            buttonsHtml = `
            <button class="${favBtnClass}" title="${title}" onclick="toggleImportant(${task.id}, ${task.noteId || 'null'})">
                <i class="${starClass}"></i>
            </button>
            <div class="task-drag-handle" title="${window.t ? window.t('tasklist.drag_to_reorder', null, 'Drag to reorder') : 'Drag to reorder'}">
                <i class="fa-grip-vertical"></i>
            </div>`;
        }
        
        return `
        <div class="task-item ${task.completed ? 'completed' : ''} ${task.important ? 'important' : ''}" data-task-id="${task.id}" draggable="false">
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id}, ${task.noteId || 'null'})">
            <span class="task-text" onclick="editTask(${task.id}, ${task.noteId || 'null'})">${linkifyHtml(task.text)}</span>
            ${buttonsHtml}
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
        tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]');
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

    // Get task insert order preference from database (default: bottom)
    fetch('/api/v1/settings/tasklist_insert_order', {
        method: 'GET',
        credentials: 'same-origin'
    })
        .then(r => r.json())
        .then(data => {
            const insertOrder = (data && data.success && data.value) ? data.value : 'bottom';
            
            // Build groups to ensure completed tasks always stay at the end
            const importantIncomplete = [];
            const normalIncomplete = [];
            const completedArr = [];

            for (let i = 0; i < tasks.length; i++) {
                const t = tasks[i];
                if (t.completed) completedArr.push(t);
                else if (t.important) importantIncomplete.push(t);
                else normalIncomplete.push(t);
            }

            if (insertOrder === 'top') {
                // Insert after important incomplete tasks, i.e. at start of normalIncomplete
                normalIncomplete.splice(0, 0, newTask);
            } else {
                // Insert at end of incomplete group (before completed tasks)
                normalIncomplete.push(newTask);
            }

            // Reassemble ensuring completed tasks remain last
            tasks = [].concat(importantIncomplete, normalIncomplete, completedArr);

            noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

            // Re-render tasks
            const tasksList = document.getElementById(`tasks-list-${noteId}`);
            if (tasksList) {
                tasksList.innerHTML = renderTasks(tasks, noteId);
                // Re-enable DnD after DOM change
                enableDragAndDrop(noteId);
            }

            // Clear input
            input.value = '';

            // Mark as modified
            markTaskListAsModified(noteId);
        })
        .catch(err => {
            console.error('Error getting task order preference:', err);
            // Fallback to bottom insertion on error
            tasks.push(newTask);
            noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

            const tasksList = document.getElementById(`tasks-list-${noteId}`);
            if (tasksList) {
                tasksList.innerHTML = renderTasks(tasks, noteId);
                enableDragAndDrop(noteId);
            }
            input.value = '';
            markTaskListAsModified(noteId);
        });
}

// Toggle task completion
function toggleTask(taskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]');
    } catch (e) {
        return;
    }

    const taskIndex = tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) return;

    tasks[taskIndex].completed = !tasks[taskIndex].completed;
    
    // Reorder tasks to maintain grouping:
    // - important incomplete tasks first
    // - other incomplete tasks next
    // - completed tasks last
    // Additionally:
    // - when insert order is 'bottom', newly completed tasks should be
    //   placed at the start of the completed group (so they don't end up
    //   below existing checked tasks when new tasks are added at bottom)
    const insertOrder = (noteEntry.dataset.tasklistInsertOrder === 'top') ? 'top' : 'bottom';

    // Build groups preserving original relative order
    const importantIncomplete = [];
    const normalIncomplete = [];
    const completedArr = [];

    for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (t.completed) completedArr.push(t);
        else if (t.important) importantIncomplete.push(t);
        else normalIncomplete.push(t);
    }

    const toggledTask = tasks[taskIndex];

    if (toggledTask.completed) {
        // Ensure toggled completed task is at the start of completed group when bottom-insert
        // Remove any existing occurrence (should be one) and then insert appropriately
        const idx = completedArr.findIndex(t => String(t.id) === String(toggledTask.id));
        if (idx !== -1) completedArr.splice(idx, 1);
        if (insertOrder === 'bottom') {
            completedArr.unshift(toggledTask);
        } else {
            // in top-insert mode, keep completed tasks order (append)
            completedArr.push(toggledTask);
        }
    } else {
        // toggled to incomplete: place at the end of its corresponding incomplete group
        // Remove any occurrence from completedArr if present
        const cidx = completedArr.findIndex(t => String(t.id) === String(toggledTask.id));
        if (cidx !== -1) completedArr.splice(cidx, 1);

        // Remove from incomplete groups if present to avoid duplicates
        let ii = importantIncomplete.findIndex(t => String(t.id) === String(toggledTask.id));
        if (ii !== -1) importantIncomplete.splice(ii, 1);
        ii = normalIncomplete.findIndex(t => String(t.id) === String(toggledTask.id));
        if (ii !== -1) normalIncomplete.splice(ii, 1);

        if (toggledTask.important) importantIncomplete.push(toggledTask);
        else normalIncomplete.push(toggledTask);
    }

    // Reassemble tasks preserving the chosen grouping
    tasks = [].concat(importantIncomplete, normalIncomplete, completedArr);
    
    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

    // Re-render tasks list with new order
    const tasksList = document.getElementById(`tasks-list-${noteId}`);
    if (tasksList) {
        tasksList.innerHTML = renderTasks(tasks, noteId);
        // Re-enable DnD after reorder
        enableDragAndDrop(noteId);
    }

    markTaskListAsModified(noteId);
}

// Edit task text
function editTask(taskId, noteId) {
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskItem) return;

    const taskText = taskItem.querySelector('.task-text');
    if (!taskText) return;

    // Get the original text from the data store, not from the rendered HTML
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]');
    } catch (e) {
        tasks = [];
    }

    const task = tasks.find(t => t.id === taskId);
    const currentText = task ? task.text : taskText.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'task-edit-input';
    // Allow up to 4000 characters for a task line
    input.maxLength = 4000;
    
    // Flag to prevent double-save (Enter + blur)
    let isSaving = false;

    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!isSaving) {
                isSaving = true;
                saveTaskEdit(taskId, noteId, input.value.trim());
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            isSaving = true; // Prevent blur from saving
            cancelTaskEdit(taskId, noteId, currentText);
        }
    });

    input.addEventListener('blur', function() {
        if (!isSaving) {
            isSaving = true;
            saveTaskEdit(taskId, noteId, input.value.trim());
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
        tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]');
    } catch (e) {
        return;
    }

    const taskIndex = tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) return;

    tasks[taskIndex].text = newText;
    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

    // Re-render task
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskItem) {
        const taskText = taskItem.querySelector('.task-text') || taskItem.querySelector('.task-edit-input');
        if (taskText && taskText.parentNode) {
            const newTaskText = document.createElement('span');
            newTaskText.className = 'task-text';
            newTaskText.innerHTML = linkifyHtml(newText);
            newTaskText.onclick = () => editTask(taskId, noteId);
            // Ensure links inside don't trigger the span's onclick
            const anchors = newTaskText.querySelectorAll('a');
            anchors.forEach(a => a.addEventListener('click', e => e.stopPropagation()));

            // Check if element is still in DOM before replacing
            try {
                taskText.replaceWith(newTaskText);
            } catch (e) {
                // Element already removed, ignore
                console.debug('Task element already replaced:', e);
            }
        }
    }

    // Ensure drag & drop still works after inline edit
    enableDragAndDrop(noteId);

    markTaskListAsModified(noteId);
}

// Cancel task edit
function cancelTaskEdit(taskId, noteId, originalText) {
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskItem) return;

    const input = taskItem.querySelector('.task-edit-input');
    if (!input) return;

    const taskText = document.createElement('span');
    taskText.className = 'task-text';
    taskText.innerHTML = linkifyHtml(originalText);
    taskText.onclick = () => editTask(taskId, noteId);
    const anchors2 = taskText.querySelectorAll('a');
    anchors2.forEach(a => a.addEventListener('click', e => e.stopPropagation()));
    input.replaceWith(taskText);
}

// Delete task
function deleteTask(taskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]');
    } catch (e) {
        return;
    }

    tasks = tasks.filter(task => task.id !== taskId);
    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

    // Remove from UI
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskItem) {
        taskItem.remove();
    }

    // Ensure DnD state is consistent after deletion
    enableDragAndDrop(noteId);

    markTaskListAsModified(noteId);
}

// Toggle important flag for a task and move it to top when important
function toggleImportant(taskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]');
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

    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

    // Re-render tasks list
    const tasksList = document.getElementById(`tasks-list-${noteId}`);
    if (tasksList) {
        tasksList.innerHTML = renderTasks(tasks, noteId);
        // Re-enable DnD after reorder
        enableDragAndDrop(noteId);
    }

    markTaskListAsModified(noteId);
}

// Clear all completed tasks
function clearCompletedTasks(noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = [];
    try {
        tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]');
    } catch (e) {
        return;
    }

    // Count completed tasks before filtering
    const completedCount = tasks.filter(task => task.completed).length;
    
    if (completedCount === 0) {
        // No completed tasks to clear
        if (window.modalAlert && window.modalAlert.info) {
            window.modalAlert.info(
                window.t ? window.t('tasklist.no_completed_tasks', null, 'No completed tasks to clear.') : 'No completed tasks to clear.'
            );
        }
        return;
    }

    // Ask for confirmation
    if (window.modalAlert && window.modalAlert.confirm) {
        const message = window.t 
            ? window.t('tasklist.confirm_clear_completed', {count: completedCount}, 'Delete {{count}} completed task(s)?')
            : `Delete ${completedCount} completed task(s)?`;
        
        window.modalAlert.confirm(message).then(confirmed => {
            if (!confirmed) return;
            
            // Filter out completed tasks
            tasks = tasks.filter(task => !task.completed);
            noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

            // Re-render the task list
            const tasksList = document.getElementById(`tasks-list-${noteId}`);
            if (tasksList) {
                tasksList.innerHTML = renderTasks(tasks, noteId);
                enableDragAndDrop(noteId);
            }

            markTaskListAsModified(noteId);
        });
    } else {
        // Fallback to native confirm if modalAlert not available
        const message = `Delete ${completedCount} completed task(s)?`;
        if (confirm(message)) {
            tasks = tasks.filter(task => !task.completed);
            noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

            const tasksList = document.getElementById(`tasks-list-${noteId}`);
            if (tasksList) {
                tasksList.innerHTML = renderTasks(tasks, noteId);
                enableDragAndDrop(noteId);
            }

            markTaskListAsModified(noteId);
        }
    }
}

// Mark note as modified (to trigger save)
function markTaskListAsModified(noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (noteEntry) {
        // Ensure noteid is set correctly for task lists
        noteid = noteId;
        // Trigger immediate save for task actions
        saveNoteToServer();
    }
}

// Get task list data for saving
function getTaskListData(noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return '';

    try {
        // Use the correct dataset attribute name
        const tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]');
        return JSON.stringify(tasks);
    } catch (e) {
        console.error('Error getting task list data:', e);
        return '';
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Convert plain-text URLs into clickable anchor tags safely.
// Strategy: escape the full text first, then replace URL-like substrings
// in the escaped string with anchor tags. Anchors include
// target="_blank" rel="noopener noreferrer" and stopPropagation
// inline to avoid triggering parent click handlers.
function linkifyHtml(text) {
    if (!text) return '';
    // Basic URL regex (http/https/www)
    const urlRegex = /((https?:\/\/)[^\s"'<>]+)|(www\.[^\s"'<>]+)/ig;
    // Escape input first
    let escaped = escapeHtml(text);

    // Replace matches with anchors. Because escaped may contain HTML entities,
    // the regex still works on the escaped string for common URLs.
    const replaced = escaped.replace(urlRegex, function(m) {
        let href = m;
        if (!/^https?:\/\//i.test(href)) href = 'http://' + href;
        
        // Truncate display text if URL is too long (keep full URL in href and title)
        let displayText = m;
        const maxLength = 50;
        if (m.length > maxLength) {
            displayText = m.substring(0, maxLength - 3) + '...';
        }
        
        // Use double quotes around attributes and stop propagation on click to avoid editing
        // Add title attribute to show full URL on hover
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" title="${m}" onclick="event.stopPropagation();">${displayText}</a>`;
    });

    return replaced;
}

// Export functions globally
window.initializeTaskList = initializeTaskList;
window.addTask = addTask;
window.toggleTask = toggleTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.getTaskListData = getTaskListData;
window.toggleImportant = toggleImportant;
window.toggleTaskInsertOrder = toggleTaskInsertOrder;
window.clearCompletedTasks = clearCompletedTasks;

// Toggle the task insert order preference (top vs bottom)
function toggleTaskInsertOrder() {
    // Get current order from database
    fetch('/api/v1/settings/tasklist_insert_order', {
        method: 'GET',
        credentials: 'same-origin'
    })
        .then(r => r.json())
        .then(data => {
            const currentOrder = (data && data.success && data.value) ? data.value : 'bottom';
            const newOrder = currentOrder === 'top' ? 'bottom' : 'top';
            
            // Save new order to database
            return fetch('/api/v1/settings/tasklist_insert_order', {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: newOrder })
            })
                .then(r => r.json())
                .then(() => {
                    // Update button appearance
                    updateTaskInsertOrderButton(newOrder);
                    
                    // Show a brief notification
                    const message = newOrder === 'top' 
                        ? (window.t ? window.t('tasklist.add_to_top', null, 'Add new tasks at the top') : 'Add new tasks at the top')
                        : (window.t ? window.t('tasklist.add_to_bottom', null, 'Add new tasks at the bottom') : 'Add new tasks at the bottom');
                    
                    // Use existing notification system if available
                    if (typeof window.showTemporaryNotification === 'function') {
                        window.showTemporaryNotification(message, 2000);
                    }
                });
        })
        .catch(err => {
            console.error('Error toggling task order:', err);
        });
}

// Update the task insert order button appearance
function updateTaskInsertOrderButton(orderValue) {
    const btn = document.querySelector('.btn-task-order');
    if (!btn) return;
    
    // If orderValue is provided, use it; otherwise fetch from database
    if (orderValue) {
        applyOrderToButton(orderValue);
    } else {
        fetch('/api/v1/settings/tasklist_insert_order', {
            method: 'GET',
            credentials: 'same-origin'
        })
            .then(r => r.json())
            .then(data => {
                const currentOrder = (data && data.success && data.value) ? data.value : 'bottom';
                applyOrderToButton(currentOrder);
            })
            .catch(() => {
                applyOrderToButton('bottom'); // fallback to default
            });
    }
    
    function applyOrderToButton(currentOrder) {
        const icon = btn.querySelector('i');
        
        if (currentOrder === 'top') {
            btn.classList.add('active');
            if (icon) {
                icon.className = 'fa-arrow-up';
            }
            btn.title = window.t ? window.t('tasklist.add_to_top', null, 'Add new tasks at the top') : 'Add new tasks at the top';
        } else {
            btn.classList.remove('active');
            if (icon) {
                icon.className = 'fa-arrow-down';
            }
            btn.title = window.t ? window.t('tasklist.add_to_bottom', null, 'Add new tasks at the bottom') : 'Add new tasks at the bottom';
        }
    }
}

// Enable HTML5 drag & drop reordering for a specific note task list
function enableDragAndDrop(noteId) {
    const tasksList = document.getElementById(`tasks-list-${noteId}`);
    if (!tasksList) return;

    // If Sortable has already been initialized for this list, skip
    if (tasksList.dataset.sortable === '1') return;

    // If SortableJS is available, use it for robust drag & drop (better mobile/touch support)
    function initSortable() {
        if (!tasksList || tasksList.dataset.sortable === '1') return;
        try {
            const sortable = new Sortable(tasksList, {
                animation: 150,
                handle: '.task-drag-handle', // Only allow dragging by the hamburger handle
                onStart: function(evt) {
                    // Add dragging class for visual feedback
                    evt.item.classList.add('dragging');
                },
                onEnd: function(evt) {
                    // Remove dragging class
                    evt.item.classList.remove('dragging');
                    // sortable onEnd

                    const noteEntry = document.getElementById('entry' + noteId);
                    if (!noteEntry) return;

                    let tasks = [];
                    try { tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]'); } catch (err) { return; }

                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    if (typeof oldIndex !== 'number' || typeof newIndex !== 'number' || oldIndex === newIndex) return;

                    const [moved] = tasks.splice(oldIndex, 1);
                    tasks.splice(newIndex, 0, moved);

                    // Save new order
                    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

                    // sortable moved

                    // Mark note modified so it gets saved
                    markTaskListAsModified(noteId);
                }
            });

            tasksList.dataset.sortable = '1';
            // store instance if needed
            tasksList._sortableInstance = sortable;
        } catch (e) {
            console.error('tasklist: failed to init Sortable', e);
        }
    }

    // If Sortable is present, use it; otherwise load from local file then init
    if (typeof Sortable !== 'undefined') {
        initSortable();
        return;
    }

    // Load SortableJS from local file as a progressive enhancement
    const existingScript = document.querySelector('script[data-sortable-local]');
    if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'js/Sortable.min.js';
        script.async = true;
        script.setAttribute('data-sortable-local', '1');
        script.onload = function() { initSortable(); };
        script.onerror = function() {
            // If local file fails, fall back to HTML5 implementation below
            try { console.warn('tasklist: SortableJS local file failed, falling back to HTML5 DnD'); } catch(e){}
            // continue to HTML5 fallback
            attachHTML5Handlers();
        };
        document.head.appendChild(script);
    } else {
        // Script already loading or present; wait a bit and try to init
        setTimeout(function() {
            if (typeof Sortable !== 'undefined') initSortable();
            else attachHTML5Handlers();
        }, 250);
    }

    // HTML5 DnD fallback (kept as before) --------------------------------------------------
    function attachHTML5Handlers() {
        // Avoid attaching listeners multiple times
        if (tasksList.dataset.dragEnabled === '1') return;
        tasksList.dataset.dragEnabled = '1';

        let draggedId = null;

        function clearDragOver() {
            const prev = tasksList.querySelectorAll('.drag-over');
            prev.forEach(el => el.classList.remove('drag-over'));
        }

        tasksList.addEventListener('dragstart', function(e) {
            const dragHandle = e.target.closest('.task-drag-handle');
            if (!dragHandle) return;
            const item = dragHandle.closest('.task-item');
            if (!item) return;
            draggedId = item.dataset.taskId;
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', draggedId); } catch (err) { /* some browsers */ }
            item.classList.add('dragging');
            // dragstart
        });

        tasksList.addEventListener('dragover', function(e) {
            e.preventDefault(); // allow drop
            const over = e.target.closest('.task-item');
            clearDragOver();
            if (over && over.dataset.taskId !== draggedId) {
                over.classList.add('drag-over');
                // dragover
            }
        });

        tasksList.addEventListener('dragleave', function(e) {
            const left = e.target.closest('.task-item');
            if (left) left.classList.remove('drag-over');
        });

        tasksList.addEventListener('drop', function(e) {
            e.preventDefault();
            clearDragOver();

            const targetItem = e.target.closest('.task-item');
            const noteEntry = document.getElementById('entry' + noteId);
            if (!noteEntry) return;

            let tasks = [];
            try { tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]'); } catch (err) { return; }

            const draggedIdFromData = e.dataTransfer && e.dataTransfer.getData ? e.dataTransfer.getData('text/plain') : null;
            const idStr = draggedIdFromData || draggedId;
            if (!idStr) return;

            const draggedIndex = tasks.findIndex(t => String(t.id) === String(idStr));
            // drop
            if (draggedIndex === -1) return;

            // If dropped on an item, insert before it. If dropped on empty space, move to end.
            let targetIndex = tasks.length;
            if (targetItem) {
                const targetId = targetItem.dataset.taskId;
                targetIndex = tasks.findIndex(t => String(t.id) === String(targetId));
                if (targetIndex === -1) return;
            }

            const [moved] = tasks.splice(draggedIndex, 1);
            if (draggedIndex < targetIndex) targetIndex -= 1;
            tasks.splice(targetIndex, 0, moved);

            // Save new order
            noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

            // Re-render and re-enable handlers
            const listEl = document.getElementById(`tasks-list-${noteId}`);
            if (listEl) {
                listEl.innerHTML = renderTasks(tasks, noteId);
                // allow tiny timeout to ensure DOM nodes are present
                setTimeout(() => enableDragAndDrop(noteId), 0);
            }

            // dropped and reordered
            // Mark note modified so it gets saved
            markTaskListAsModified(noteId);
        });

        tasksList.addEventListener('dragend', function(e) {
            const item = e.target.closest('.task-item');
            if (item) item.classList.remove('dragging');
            clearDragOver();
            draggedId = null;
            // dragend
        });

        // Mobile / touch fallback using Pointer events (long-press to start)
        let pointerDragState = null;

        function onPointerDown(e) {
            // Only left button or touch
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const dragHandle = e.target.closest('.task-drag-handle');
            if (!dragHandle) return;

            const target = dragHandle.closest('.task-item');

            // Prepare state
            pointerDragState = {
                startTarget: target,
                noteId: noteId,
                startX: e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0,
                startY: e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0,
                longPressTimer: null,
                placeholder: null,
                clone: null
            };

            // Long press to initiate drag (200ms)
            pointerDragState.longPressTimer = setTimeout(() => {
                startPointerDrag(e);
            }, 200);

            // Cancel on pointerup/cancel before longpress
            function cancelInit() {
                if (pointerDragState) {
                    clearTimeout(pointerDragState.longPressTimer);
                    pointerDragState = null;
                }
                window.removeEventListener('pointerup', cancelInit);
                window.removeEventListener('pointercancel', cancelInit);
            }

            window.addEventListener('pointerup', cancelInit);
            window.addEventListener('pointercancel', cancelInit);
        }

        function startPointerDrag(e) {
            if (!pointerDragState) return;
            const state = pointerDragState;
            const item = state.startTarget;
            const rect = item.getBoundingClientRect();

            // Create placeholder
            const placeholder = document.createElement('div');
            placeholder.className = 'task-item placeholder';
            placeholder.style.height = rect.height + 'px';
            placeholder.style.background = 'rgba(0,0,0,0.03)';
            item.parentNode.insertBefore(placeholder, item.nextSibling);
            state.placeholder = placeholder;

            // Create clone
            const clone = item.cloneNode(true);
            clone.style.position = 'fixed';
            clone.style.left = rect.left + 'px';
            clone.style.top = rect.top + 'px';
            clone.style.width = rect.width + 'px';
            clone.style.pointerEvents = 'none';
            clone.style.opacity = '0.9';
            clone.classList.add('dragging');
            document.body.appendChild(clone);
            state.clone = clone;

            // mark source
            item.style.visibility = 'hidden';

            // Listen for move and end
            function onPointerMove(ev) {
                ev.preventDefault();
                const x = ev.clientX;
                const y = ev.clientY;
                clone.style.left = (x - rect.width/2) + 'px';
                clone.style.top = (y - rect.height/2) + 'px';

                // Find element under pointer
                const el = document.elementFromPoint(x, y);
                const over = el ? el.closest('.task-item') : null;

                // If over placeholder or clone skip
                if (over && over !== item && over !== state.placeholder && over !== state.clone) {
                    // Insert placeholder before/after depending on pointer Y
                    const overRect = over.getBoundingClientRect();
                    const middle = overRect.top + overRect.height/2;
                    if (y < middle) {
                        over.parentNode.insertBefore(state.placeholder, over);
                    } else {
                        over.parentNode.insertBefore(state.placeholder, over.nextSibling);
                    }
                }
            }

            function onPointerUp(ev) {
                // finalize
                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointercancel', onPointerUp);

                const noteEntry = document.getElementById('entry' + state.noteId);
                if (noteEntry && state.placeholder) {
                    // Rebuild tasks array order according to DOM
                    let tasks = [];
                    try { tasks = JSON.parse(noteEntry.dataset.tasklistJson || '[]'); } catch (err) { tasks = []; }

                    // Map DOM order to tasks order
                    const items = Array.from(document.getElementById(`tasks-list-${state.noteId}`).querySelectorAll('.task-item'));
                    const orderIds = items.map(it => it.dataset.taskId).filter(Boolean);

                    // Reorder tasks according to orderIds
                    const newTasks = [];
                    orderIds.forEach(id => {
                        const found = tasks.find(t => String(t.id) === String(id));
                        if (found) newTasks.push(found);
                    });
                    // If clone was hidden source, ensure it's removed from visibility
                    const original = state.startTarget;
                    if (original) original.style.visibility = '';

                    // Clean up placeholder and clone
                    if (state.clone && state.clone.parentNode) state.clone.parentNode.removeChild(state.clone);
                    if (state.placeholder && state.placeholder.parentNode) state.placeholder.parentNode.removeChild(state.placeholder);

                    // Save new order
                    if (newTasks.length > 0) {
                        noteEntry.dataset.tasklistJson = JSON.stringify(newTasks);
                        const listEl = document.getElementById(`tasks-list-${state.noteId}`);
                        if (listEl) {
                            listEl.innerHTML = renderTasks(newTasks, state.noteId);
                            setTimeout(() => enableDragAndDrop(state.noteId), 0);
                        }
                        markTaskListAsModified(state.noteId);
                    }
                }

                pointerDragState = null;
            }

            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerUp);
        }

        // Attach pointerdown for mobile-friendly dragging
        tasksList.addEventListener('pointerdown', onPointerDown);
    }

    // If Sortable fails to load within a short time, fall back to HTML5 handlers
    setTimeout(function() {
        if (typeof Sortable === 'undefined' && tasksList.dataset.dragEnabled !== '1' && tasksList.dataset.sortable !== '1') {
            attachHTML5Handlers();
        }
    }, 500);
}

// Listen for i18n loaded event to update task input placeholders
document.addEventListener('poznote:i18n:loaded', function() {
    // Update all task input placeholders with translations
    document.querySelectorAll('.task-input').forEach(function(input) {
        input.placeholder = window.t ? window.t('tasklist.input_placeholder', null, 'Write a new task and press enter to add it to the list...') : 'Write a new task and press enter to add it to the list...';
    });
    
    // Update task insert order button
    updateTaskInsertOrderButton();
});

// Initialize task insert order button on page load
document.addEventListener('DOMContentLoaded', function() {
    updateTaskInsertOrderButton();
});