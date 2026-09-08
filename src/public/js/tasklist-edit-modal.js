// Task lists: the task edit modal.
// 
// Also covers the inline edit path used when the list is the open note.

// onSave: optional callback that persists the new text itself (used by the
// embedded task list widget, whose list is not the open note); without it the
// edit goes through saveTaskEdit on #entry{noteId}.
let taskEditState = {
    taskId: null,
    noteId: null,
    originalText: '',
    lastFocusedElement: null,
    onSave: null
};

function getTaskEditEmptyError() {
    return window.t
        ? window.t('tasklist.edit_empty_error', null, 'Task text cannot be empty.')
        : 'Task text cannot be empty.';
}

function setTaskEditError(message) {
    const errorEl = document.getElementById('taskEditError');
    if (!errorEl) return;

    errorEl.textContent = message || '';
    errorEl.style.display = message ? 'block' : 'none';
}

// Grow the edit textarea to fit its content; the modal's flex column clamps
// it to the screen height and the textarea scrolls past that point
function autoSizeTaskEditTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    var borders = textarea.offsetHeight - textarea.clientHeight;
    textarea.style.height = (textarea.scrollHeight + borders) + 'px';
}

// On mobile the sidebar and the note share one horizontal pane; the virtual
// keyboard closing while the pane scroll animates can strand the view between
// the two columns. Re-assert the note column after the modal closes.
// Instant (no animation): a smooth scroll here reads as the sidebar-to-note
// transition replaying, and a no-op set is invisible when already in place.
function snapMobileViewToNoteColumn() {
    if (window.innerWidth > 800) return;
    var snap = function () {
        var left = window.innerWidth;
        var root = document.scrollingElement || document.documentElement;
        root.scrollLeft = left;
        document.body.scrollLeft = left;
        window.scrollTo({ left: left, behavior: 'auto' });
    };
    requestAnimationFrame(snap);
    // The keyboard collapses asynchronously and can shift the pane again
    setTimeout(snap, 400);
}

function closeTaskEditModal() {
    if (typeof closeModal === 'function') {
        closeModal('taskEditModal');
    } else {
        const modal = document.getElementById('taskEditModal');
        if (modal) modal.style.display = 'none';
    }

    const lastFocusedElement = taskEditState.lastFocusedElement;
    taskEditState = {
        taskId: null,
        noteId: null,
        originalText: '',
        lastFocusedElement: null,
        onSave: null
    };
    setTaskEditError('');

    if (lastFocusedElement && document.contains(lastFocusedElement)) {
        lastFocusedElement.focus({ preventScroll: true });
    }

    snapMobileViewToNoteColumn();
}

function saveTaskEditFromModal() {
    const textarea = document.getElementById('taskEditTextarea');
    if (!textarea || taskEditState.taskId === null || taskEditState.noteId === null) return;

    const newText = textarea.value.trim();
    if (!newText) {
        setTaskEditError(getTaskEditEmptyError());
        textarea.focus();
        return;
    }

    const savedTaskId = taskEditState.taskId;
    const onSave = taskEditState.onSave;
    if (newText !== taskEditState.originalText) {
        if (typeof onSave === 'function') {
            onSave(newText);
        } else {
            saveTaskEdit(taskEditState.taskId, taskEditState.noteId, newText);
        }
    }

    closeTaskEditModal();

    // A custom saver re-renders its own UI
    if (typeof onSave === 'function') return;

    // Restore focus to the re-rendered task text span (saveTaskEdit replaced the old span).
    const newTaskItem = savedTaskId !== null ? document.querySelector('[data-task-id="' + savedTaskId + '"]') : null;
    const newTaskText = newTaskItem ? newTaskItem.querySelector('.task-text') : null;
    if (newTaskText) {
        newTaskText.focus({ preventScroll: true });
    }
}

function attachTaskEditModalHandlers(modal) {
    if (!modal || modal.dataset.handlersAttached === 'true') return;

    const textarea = document.getElementById('taskEditTextarea');
    const saveBtn = document.getElementById('saveTaskEditBtn');
    const cancelBtn = document.getElementById('cancelTaskEditBtn');

    if (textarea) {
        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveTaskEditFromModal();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeTaskEditModal();
            }
        });

        textarea.addEventListener('input', function() {
            setTaskEditError('');
            autoSizeTaskEditTextarea(textarea);
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', saveTaskEditFromModal);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeTaskEditModal);
    }

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeTaskEditModal();
        }
    });

    modal.dataset.handlersAttached = 'true';
}

function openTaskEditModal(taskId, noteId, currentText, lastFocusedElement, options) {
    const modal = document.getElementById('taskEditModal');
    const textarea = document.getElementById('taskEditTextarea');
    const saveBtn = document.getElementById('saveTaskEditBtn');
    if (!modal || !textarea || !saveBtn) return false;

    attachTaskEditModalHandlers(modal);

    taskEditState = {
        taskId: taskId,
        noteId: noteId,
        originalText: currentText,
        lastFocusedElement: lastFocusedElement || document.activeElement,
        onSave: (options && typeof options.onSave === 'function') ? options.onSave : null
    };

    setTaskEditError('');
    textarea.value = currentText;
    textarea.maxLength = 4000;
    modal.style.display = 'flex';

    requestAnimationFrame(function() {
        autoSizeTaskEditTextarea(textarea);
        textarea.focus();
        const end = textarea.value.length;
        try {
            textarea.setSelectionRange(end, end);
        } catch (e) {
            // Some browsers do not support selection APIs on inactive controls.
            console.debug('tasklist-edit-modal: openTaskEditModal() failed:', e);
        }
    });

    return true;
}

// Edit task text
function editTask(taskId, noteId) {
    if (isPublicWorkspaceReadOnly()) return;

    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskItem) return;

    const taskText = taskItem.querySelector('.task-text');
    if (!taskText) return;

    // Get the original text from the data store, not from the rendered HTML
    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = parseTaskData(noteEntry);

    const task = tasks.find(t => t.id === taskId);
    const currentText = task ? task.text : taskText.textContent;

    if (openTaskEditModal(taskId, noteId, currentText, taskText)) {
        return;
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'task-edit-input';
    input.dataset.taskId = String(taskId);
    input.dataset.noteId = String(noteId);
    // Allow up to 4000 characters for a task line
    input.maxLength = 4000;
    
    // Flag to prevent double-save (Enter + blur)
    let isSaving = false;

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation(); // Standardize event handling
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
        if (isTaskEditBlurSavePaused(input)) {
            return;
        }

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
    if (isPublicWorkspaceReadOnly()) return;
    if (!newText) return;

    const noteEntry = document.getElementById('entry' + noteId);
    if (!noteEntry) return;

    let tasks = parseTaskData(noteEntry);

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
            
            // Process references [[Note Title]] in the new text
            if (typeof window.processNoteReferences === 'function') {
                const workspace = typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : (window.selectedWorkspace || '');
                window.processNoteReferences(newTaskText, workspace);
            }

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
