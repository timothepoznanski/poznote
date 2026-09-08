// Task lists: adding and toggling tasks.

// Add a new task
function addTask(noteId) {
    const input = document.getElementById(`task-input-${noteId}`);
    if (!input) return;

    const taskText = input.value.trim();
    if (!taskText) return;

    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = parseTaskData(noteEntry);

    const newTask = {
        id: Date.now() + Math.random(),
        text: taskText,
        completed: false,
        noteId: noteId,
        important: false,
        dueAt: null
    };

    // Insert synchronously using the cached preference (default: bottom).
    // No network call here so the task always appears immediately, even on
    // slow/unstable mobile connections, and rapid successive additions can't
    // race and overwrite each other.
    const insertOrder = (cachedTasklistInsertOrder === 'top') ? 'top' : 'bottom';

    const groups = groupTasksByStatus(tasks);
    if (insertOrder === 'top') {
        groups.normal.splice(0, 0, newTask);
    } else {
        groups.normal.push(newTask);
    }

    tasks = [].concat(groups.important, groups.normal, groups.completed);

    saveAndRenderTasks(noteId, tasks);

    // Clear input
    input.value = '';

    // Refocus so the user can keep typing the next task (important on mobile).
    input.focus();

    // Mark as modified
    markTaskListAsModified(noteId);

    // Refresh the cached preference in the background (does not block the add).
    if (cachedTasklistInsertOrder === null) {
        refreshCachedTasklistInsertOrder();
    }
}

// Cancel the pending reminder of a task (completing or deleting it)
function clearTaskReminderIfAny(noteId, task) {
    if (!task || !task.dueReminder) return;
    task.dueReminder = false;
    try {
        fetch('/api/v1/notes/' + noteId + '/task-reminder', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ task_id: String(task.id) })
        });
    } catch (e) { }
}

// Toggle task completion
function toggleTask(taskId, noteId) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = parseTaskData(noteEntry);

    const taskIndex = tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) return;

    tasks[taskIndex].completed = !tasks[taskIndex].completed;

    // Completing a task cancels its pending reminder
    if (tasks[taskIndex].completed) {
        clearTaskReminderIfAny(noteId, tasks[taskIndex]);
    }
    
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
    const { important: importantIncomplete, normal: normalIncomplete, completed: completedArr } = groupTasksByStatus(tasks);

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
    
    saveAndRenderTasks(noteId, tasks);

    markTaskListAsModified(noteId);
}
