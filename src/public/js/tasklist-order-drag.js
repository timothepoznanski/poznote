// Task lists: ordering and drag and drop.
// 
// Insert order (newest first or last), bulk operations, drag and drop on both desktop
// and touch, and the window.* exports for the whole tasklist module set, so it must
// load last.

function insertTaskWithOrder(tasks, task, insertOrder) {
    const { important, normal, completed } = groupTasksByStatus(tasks);

    if (task.completed) {
        if (insertOrder === 'bottom') completed.unshift(task);
        else completed.push(task);
    } else if (task.important) {
        if (insertOrder === 'top') important.unshift(task);
        else important.push(task);
    } else {
        if (insertOrder === 'top') normal.unshift(task);
        else normal.push(task);
    }

    return [].concat(important, normal, completed);
}

async function getTasklistInsertOrder() {
    try {
        const resp = await fetch('/api/v1/settings/tasklist_insert_order', {
            method: 'GET',
            credentials: 'same-origin'
        });
        const data = await resp.json();
        return (data && data.success && (data.value === 'top' || data.value === 'bottom')) ? data.value : 'bottom';
    } catch (e) {
        return 'bottom';
    }
}

// Clear all completed tasks
function clearCompletedTasks(noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = parseTaskData(noteEntry);

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
            saveAndRenderTasks(noteId, tasks);

            markTaskListAsModified(noteId);
        });
    } else {
        // Fallback to native confirm if modalAlert not available
        const message = `Delete ${completedCount} completed task(s)?`;
        if (confirm(message)) {
            tasks = tasks.filter(task => !task.completed);
            saveAndRenderTasks(noteId, tasks);

            markTaskListAsModified(noteId);
        }
    }
}

// Uncheck all tasks (mark all as incomplete)
function uncheckAllTasks(noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = parseTaskData(noteEntry);

    // Count checked tasks
    const checkedCount = tasks.filter(task => task.completed).length;
    
    if (checkedCount === 0) {
        // No checked tasks to uncheck
        if (window.modalAlert && window.modalAlert.info) {
            window.modalAlert.info(
                window.t ? window.t('tasklist.no_checked_tasks', null, 'No checked tasks to uncheck.') : 'No checked tasks to uncheck.'
            );
        }
        return;
    }

    // Ask for confirmation
    if (window.modalAlert && window.modalAlert.confirm) {
        const message = window.t 
            ? window.t('tasklist.confirm_uncheck_all', {count: checkedCount}, 'Uncheck {{count}} task(s)?')
            : `Uncheck ${checkedCount} task(s)?`;
        
        window.modalAlert.confirm(message).then(confirmed => {
            if (!confirmed) return;
            
            // Mark all tasks as incomplete
            tasks.forEach(task => {
                task.completed = false;
            });
            saveAndRenderTasks(noteId, tasks);

            markTaskListAsModified(noteId);
        });
    } else {
        // Fallback to native confirm if modalAlert not available
        const message = `Uncheck ${checkedCount} task(s)?`;
        if (confirm(message)) {
            tasks.forEach(task => {
                task.completed = false;
            });
            saveAndRenderTasks(noteId, tasks);

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
    return JSON.stringify(parseTaskData(noteEntry));
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
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" data-task-url="true" title="${m}" onclick="return handleTaskLinkClick(event);">${displayText}</a>`;
    });

    return replaced;
}

// Export functions globally
window.initializeTaskList = initializeTaskList;
window.openTaskEditModal = openTaskEditModal;
window.addTask = addTask;
window.toggleTask = toggleTask;
window.editTask = editTask;
window.deleteTask = deleteTask;
window.getTaskListData = getTaskListData;
window.toggleImportant = toggleImportant;
window.toggleTaskInsertOrder = toggleTaskInsertOrder;
window.clearCompletedTasks = clearCompletedTasks;
window.openMoveTaskModal = openMoveTaskModal;

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
                    // Keep the cached preference used by addTask() in sync
                    cachedTasklistInsertOrder = newOrder;

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
                icon.className = 'lucide-arrow-up';
            }
            btn.title = window.t ? window.t('tasklist.add_to_top', null, 'Add new tasks at the top') : 'Add new tasks at the top';
        } else {
            btn.classList.remove('active');
            if (icon) {
                icon.className = 'lucide-arrow-down';
            }
            btn.title = window.t ? window.t('tasklist.add_to_bottom', null, 'Add new tasks at the bottom') : 'Add new tasks at the bottom';
        }
    }
}

// HTML5 desktop drag event handlers (extracted from enableDragAndDrop)
function attachDesktopDragHandlers(tasksList, noteId) {
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
    });

    tasksList.addEventListener('dragover', function(e) {
        e.preventDefault();
        const over = e.target.closest('.task-item');
        clearDragOver();
        if (over && over.dataset.taskId !== draggedId) {
            over.classList.add('drag-over');
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

        let tasks = parseTaskData(noteEntry);

        const draggedIdFromData = e.dataTransfer && e.dataTransfer.getData ? e.dataTransfer.getData('text/plain') : null;
        const idStr = draggedIdFromData || draggedId;
        if (!idStr) return;

        const draggedIndex = tasks.findIndex(t => String(t.id) === String(idStr));
        if (draggedIndex === -1) return;

        let targetIndex = tasks.length;
        if (targetItem) {
            const targetId = targetItem.dataset.taskId;
            targetIndex = tasks.findIndex(t => String(t.id) === String(targetId));
            if (targetIndex === -1) return;
        }

        const [moved] = tasks.splice(draggedIndex, 1);
        if (draggedIndex < targetIndex) targetIndex -= 1;
        tasks.splice(targetIndex, 0, moved);

        noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

        const listEl = document.getElementById(`tasks-list-${noteId}`);
        if (listEl) {
            listEl.innerHTML = renderTasks(tasks, noteId);
            setTimeout(() => enableDragAndDrop(noteId), 0);
        }

        markTaskListAsModified(noteId);
    });

    tasksList.addEventListener('dragend', function(e) {
        const item = e.target.closest('.task-item');
        if (item) item.classList.remove('dragging');
        clearDragOver();
        draggedId = null;
    });
}

// Mobile/touch drag handlers using Pointer events (extracted from enableDragAndDrop)
function attachMobilePointerDragHandlers(tasksList, noteId) {
    let pointerDragState = null;

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const dragHandle = e.target.closest('.task-drag-handle');
        if (!dragHandle) return;

        const target = dragHandle.closest('.task-item');

        pointerDragState = {
            startTarget: target,
            noteId: noteId,
            startX: e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0,
            startY: e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0,
            longPressTimer: null,
            placeholder: null,
            clone: null
        };

        pointerDragState.longPressTimer = setTimeout(() => {
            startPointerDrag(e);
        }, 200);

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

        const placeholder = document.createElement('div');
        placeholder.className = 'task-item placeholder';
        placeholder.style.height = rect.height + 'px';
        placeholder.style.background = 'rgba(0,0,0,0.03)';
        item.parentNode.insertBefore(placeholder, item.nextSibling);
        state.placeholder = placeholder;

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

        item.style.visibility = 'hidden';

        function onPointerMove(ev) {
            ev.preventDefault();
            const x = ev.clientX;
            const y = ev.clientY;
            clone.style.left = (x - rect.width/2) + 'px';
            clone.style.top = (y - rect.height/2) + 'px';

            const el = document.elementFromPoint(x, y);
            const over = el ? el.closest('.task-item') : null;

            if (over && over !== item && over !== state.placeholder && over !== state.clone) {
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
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);

            const noteEntry = document.getElementById('entry' + state.noteId);
            if (noteEntry && state.placeholder) {
                let tasks = parseTaskData(noteEntry);

                const items = Array.from(document.getElementById(`tasks-list-${state.noteId}`).querySelectorAll('.task-item'));
                const orderIds = items.map(it => it.dataset.taskId).filter(Boolean);

                const newTasks = [];
                orderIds.forEach(id => {
                    const found = tasks.find(t => String(t.id) === String(id));
                    if (found) newTasks.push(found);
                });

                const original = state.startTarget;
                if (original) original.style.visibility = '';

                if (state.clone && state.clone.parentNode) state.clone.parentNode.removeChild(state.clone);
                if (state.placeholder && state.placeholder.parentNode) state.placeholder.parentNode.removeChild(state.placeholder);

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

    tasksList.addEventListener('pointerdown', onPointerDown);
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

                    let tasks = parseTaskData(noteEntry);

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
            try { console.warn('tasklist: SortableJS local file failed, falling back to HTML5 DnD'); } catch (e) {
                console.debug('tasklist-order-drag: initSortable() failed:', e);
            }
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

    // HTML5 DnD fallback
    function attachHTML5Handlers() {
        if (tasksList.dataset.dragEnabled === '1') return;
        tasksList.dataset.dragEnabled = '1';
        attachDesktopDragHandlers(tasksList, noteId);
        attachMobilePointerDragHandlers(tasksList, noteId);
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

    // Prime the cached insert-order preference used by addTask()
    refreshCachedTasklistInsertOrder();
});

// Initialize task insert order button on page load
document.addEventListener('DOMContentLoaded', function() {
    updateTaskInsertOrderButton();

    // Prime the cached insert-order preference used by addTask()
    refreshCachedTasklistInsertOrder();
});
