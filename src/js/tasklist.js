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
        try {
            tasks = JSON.parse(tasklistJson);
        } catch (e) {
            console.error('Failed to parse tasklist JSON:', e);
        }
    }

    // Ensure all tasks have noteId set
    tasks.forEach(task => {
        if (!task.noteId) task.noteId = noteId;
    });

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
              placeholder="Write a new task and press enter to add it to the list..." maxlength="4000">
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
    }

    // Store tasks data
    noteEntry.dataset.tasks = JSON.stringify(tasks);

    // Enable drag & drop reordering after initial render
    enableDragAndDrop(noteId);
}

// Render individual tasks
function renderTasks(tasks, noteId) {
    if (!Array.isArray(tasks)) return '';

    return tasks.map(task => {
        const starClass = task.important ? 'task-icon-star' : 'task-icon-star';
        const favBtnClass = task.important ? 'task-important-btn btn-favorite is-favorite' : 'task-important-btn btn-favorite';
        const title = task.important ? 'Remove important' : 'Mark as important';
        
        // Conditional buttons based on completion status
        let buttonsHtml = '';
        if (task.completed) {
            // Completed tasks: show delete and drag buttons
            buttonsHtml = `
            <button class="task-delete-btn" onclick="deleteTask(${task.id}, ${task.noteId || 'null'})">
                <i class="task-icon-trash"></i>
            </button>
            <div class="task-drag-handle" title="Drag to reorder">
                <i class="fa-menu-vert-svg"></i>
            </div>`;
        } else {
            // Incomplete tasks: show favorite and drag buttons
            buttonsHtml = `
            <button class="${favBtnClass}" title="${title}" onclick="toggleImportant(${task.id}, ${task.noteId || 'null'})">
                <i class="${starClass}"></i>
            </button>
            <div class="task-drag-handle" title="Drag to reorder">
                <i class="fa-menu-vert-svg"></i>
            </div>`;
        }
        
        return `
        <div class="task-item ${task.completed ? 'completed' : ''} ${task.important ? 'important' : ''}" data-task-id="${task.id}" draggable="true">
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
        tasksList.innerHTML = renderTasks(tasks, noteId);
        // Re-enable DnD after DOM change
        enableDragAndDrop(noteId);
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
    
    // Sort tasks: important (incomplete) first, then normal (incomplete), then completed last
    tasks.sort((a, b) => {
        // Completed tasks always go to the bottom
        if (a.completed && !b.completed) return 1;
        if (!a.completed && b.completed) return -1;
        
        // Among incomplete tasks, important ones go first
        if (!a.completed && !b.completed) {
            if ((a.important ? 1 : 0) !== (b.important ? 1 : 0)) {
                return (b.important ? 1 : 0) - (a.important ? 1 : 0);
            }
        }
        
        // Keep relative order for same priority tasks
        return 0;
    });
    
    noteEntry.dataset.tasks = JSON.stringify(tasks);

    // Re-render tasks list with new order
    const tasksList = document.getElementById(`tasks-list-${noteId}`);
    if (tasksList) {
        tasksList.innerHTML = renderTasks(tasks, noteId);
        // Re-enable DnD after reorder
        enableDragAndDrop(noteId);
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
    // Allow up to 4000 characters for a task line
    input.maxLength = 4000;

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
            newTaskText.innerHTML = linkifyHtml(newText);
            newTaskText.onclick = () => editTask(taskId, noteId);
            // Ensure links inside don't trigger the span's onclick
            const anchors = newTaskText.querySelectorAll('a');
            anchors.forEach(a => a.addEventListener('click', e => e.stopPropagation()));
            taskText.replaceWith(newTaskText);
        }
    }

    // Ensure drag & drop still works after inline edit
    enableDragAndDrop(noteId);

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

    // Ensure DnD state is consistent after deletion
    enableDragAndDrop(noteId);

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
        tasksList.innerHTML = renderTasks(tasks, noteId);
        // Re-enable DnD after reorder
        enableDragAndDrop(noteId);
    }

    markNoteAsModified(noteId);
}

// Mark note as modified (to trigger save)
function markNoteAsModified(noteId) {
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
        // Use double quotes around attributes and stop propagation on click to avoid editing
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">${m}</a>`;
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
                    try { tasks = JSON.parse(noteEntry.dataset.tasks || '[]'); } catch (err) { return; }

                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    if (typeof oldIndex !== 'number' || typeof newIndex !== 'number' || oldIndex === newIndex) return;

                    const [moved] = tasks.splice(oldIndex, 1);
                    tasks.splice(newIndex, 0, moved);

                    // Save new order
                    noteEntry.dataset.tasks = JSON.stringify(tasks);

                    // sortable moved

                    // Mark note modified so it gets saved
                    markNoteAsModified(noteId);
                }
            });

            tasksList.dataset.sortable = '1';
            // store instance if needed
            tasksList._sortableInstance = sortable;
        } catch (e) {
            console.error('tasklist: failed to init Sortable', e);
        }
    }

    // If Sortable is present, use it; otherwise load from CDN then init
    if (typeof Sortable !== 'undefined') {
        initSortable();
        return;
    }

    // Load SortableJS from CDN as a progressive enhancement
    const existingScript = document.querySelector('script[data-sortable-cdn]');
    if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js';
        script.async = true;
        script.setAttribute('data-sortable-cdn', '1');
        script.onload = function() { initSortable(); };
        script.onerror = function() {
            // If CDN fails, fall back to HTML5 implementation below
            try { console.warn('tasklist: SortableJS CDN failed, falling back to HTML5 DnD'); } catch(e){}
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
            try { tasks = JSON.parse(noteEntry.dataset.tasks || '[]'); } catch (err) { return; }

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
            noteEntry.dataset.tasks = JSON.stringify(tasks);

            // Re-render and re-enable handlers
            const listEl = document.getElementById(`tasks-list-${noteId}`);
            if (listEl) {
                listEl.innerHTML = renderTasks(tasks, noteId);
                // allow tiny timeout to ensure DOM nodes are present
                setTimeout(() => enableDragAndDrop(noteId), 0);
            }

            // dropped and reordered
            // Mark note modified so it gets saved
            markNoteAsModified(noteId);
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
                    try { tasks = JSON.parse(noteEntry.dataset.tasks || '[]'); } catch (err) { tasks = []; }

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
                        noteEntry.dataset.tasks = JSON.stringify(newTasks);
                        const listEl = document.getElementById(`tasks-list-${state.noteId}`);
                        if (listEl) {
                            listEl.innerHTML = renderTasks(newTasks, state.noteId);
                            setTimeout(() => enableDragAndDrop(state.noteId), 0);
                        }
                        markNoteAsModified(state.noteId);
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