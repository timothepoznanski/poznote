// Task lists: moving a task to another list.
// 
// The move modal, its target list rendering across workspaces, and creating a new
// task list from inside it.

// Move task to another tasklist note
let moveTaskState = {
    taskId: null,
    sourceNoteId: null,
    targetNoteId: null,
    notes: []
};

function openMoveTaskModal(taskId, sourceNoteId) {
    const modal = document.getElementById('moveTaskModal');
    if (!modal) return;

    moveTaskState = {
        taskId: taskId,
        sourceNoteId: sourceNoteId,
        targetNoteId: null,
        notes: []
    };

    attachMoveTaskModalHandlers(modal);

    const list = document.getElementById('moveTaskList');
    if (list) list.innerHTML = '';

    const confirmBtn = document.getElementById('confirmMoveTaskBtn');
    if (confirmBtn) confirmBtn.disabled = true;

    const searchInput = document.getElementById('moveTaskSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }

    modal.style.display = 'flex';
    loadMoveTaskTargets('');
}

function attachMoveTaskModalHandlers(modal) {
    if (modal.dataset.handlersAttached === 'true') return;

    const searchInput = document.getElementById('moveTaskSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            loadMoveTaskTargets(e.target.value || '');
        });
    }

    const confirmBtn = document.getElementById('confirmMoveTaskBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', executeMoveTask);
    }

    modal.dataset.handlersAttached = 'true';
}

function getCurrentWorkspace() {
    return (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '')
        || (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : '')
        || '';
}

async function loadMoveTaskTargets(searchQuery) {
    const list = document.getElementById('moveTaskList');
    if (!list) return;

    list.innerHTML = '<div class="move-task-empty">' +
        (window.t ? window.t('modals.task_move.loading', null, 'Loading...') : 'Loading...') +
        '</div>';

    try {
        const workspace = getCurrentWorkspace();
        const response = await fetch(`/api/v1/notes?workspace=${encodeURIComponent(workspace)}`);
        const data = await response.json();

        let notes = (data && data.success && Array.isArray(data.notes)) ? data.notes : [];

        notes = notes.filter(n => n.type === 'tasklist' && String(n.id) !== String(moveTaskState.sourceNoteId));

        if (searchQuery && searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            notes = notes.filter(n => (n.heading || '').toLowerCase().includes(q));
        }

        moveTaskState.notes = notes;
        renderMoveTaskTargets(notes);
    } catch (e) {
        list.innerHTML = '<div class="move-task-empty">' +
            (window.t ? window.t('modals.task_move.error', null, 'Unable to load task lists.') : 'Unable to load task lists.') +
            '</div>';
    }
}

function renderMoveTaskTargets(notes) {
    const list = document.getElementById('moveTaskList');
    if (!list) return;

    list.innerHTML = '';

    if (!notes || notes.length === 0) {
        list.innerHTML = '<div class="move-task-empty">' +
            (window.t ? window.t('modals.task_move.empty', null, 'No task lists found.') : 'No task lists found.') +
            '</div>';
        return;
    }

    notes.forEach(note => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'move-task-item';

        if (String(note.id) === String(moveTaskState.targetNoteId)) {
            item.classList.add('selected');
        }

        const title = note.heading || (window.t ? window.t('note_reference.untitled', null, 'Untitled') : 'Untitled');

        const titleSpan = document.createElement('span');
        titleSpan.textContent = title;

        item.appendChild(titleSpan);

        if (note.folder) {
            const meta = document.createElement('small');
            meta.textContent = note.folder;
            item.appendChild(meta);
        }

        item.addEventListener('click', function() {
            moveTaskState.targetNoteId = note.id;
            const items = list.querySelectorAll('.move-task-item');
            items.forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');

            const confirmBtn = document.getElementById('confirmMoveTaskBtn');
            if (confirmBtn) confirmBtn.disabled = false;
        });

        list.appendChild(item);
    });
}

async function executeMoveTask() {
    const targetNoteId = moveTaskState.targetNoteId;
    const sourceNoteId = moveTaskState.sourceNoteId;
    const taskId = moveTaskState.taskId;

    if (!targetNoteId || !sourceNoteId || !taskId) return;

    const sourceEntry = document.getElementById('entry' + sourceNoteId);
    if (!sourceEntry) return;

    let sourceTasks = parseTaskData(sourceEntry);

    const taskIndex = sourceTasks.findIndex(task => String(task.id) === String(taskId));
    if (taskIndex === -1) return;

    const taskToMove = sourceTasks[taskIndex];

    const spinner = (window.modalAlert && typeof window.modalAlert.showSpinner === 'function')
        ? window.modalAlert.showSpinner(
            window.t ? window.t('modals.task_move.moving', null, 'Moving task...') : 'Moving task...'
        )
        : null;

    try {
        const workspace = getCurrentWorkspace();
        const noteResp = await fetch(`/api/v1/notes/${targetNoteId}?workspace=${encodeURIComponent(workspace)}`);
        const noteData = await noteResp.json();

        if (!noteData || !noteData.success || !noteData.note || noteData.note.type !== 'tasklist') {
            if (window.modalAlert) {
                window.modalAlert.alert(
                    window.t ? window.t('tasklist.move_error', null, 'Unable to move task') : 'Unable to move task',
                    'error'
                );
            }
            return;
        }

        let targetTasks = [];
        try {
            targetTasks = JSON.parse(noteData.note.content || '[]');
            if (!Array.isArray(targetTasks)) targetTasks = [];
        } catch (e) {
            targetTasks = [];
        }

        const newTask = {
            ...taskToMove,
            id: Date.now() + Math.random(),
            noteId: targetNoteId
        };

        const insertOrder = await getTasklistInsertOrder();
        targetTasks = insertTaskWithOrder(targetTasks, newTask, insertOrder);

        // Pass the tab's editor session id so the save is allowed when this
        // tab holds (or can acquire) the note's edit lock, like kanban.js does.
        const editorSessionId = (typeof window.getCurrentEditorSessionId === 'function')
            ? window.getCurrentEditorSessionId()
            : '';
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        const payload = { content: JSON.stringify(targetTasks) };
        if (editorSessionId) {
            headers['X-Editor-Session-ID'] = editorSessionId;
            payload.editor_session_id = editorSessionId;
        }

        const updateResp = await fetch(`/api/v1/notes/${targetNoteId}`, {
            method: 'PATCH',
            headers: headers,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });

        const updateData = await updateResp.json();
        if (!updateData || !updateData.success) {
            if (window.modalAlert) {
                window.modalAlert.alert(
                    window.t ? window.t('tasklist.move_error', null, 'Unable to move task') : 'Unable to move task',
                    'error'
                );
            }
            return;
        }

        sourceTasks.splice(taskIndex, 1);
        saveAndRenderTasks(sourceNoteId, sourceTasks);

        markTaskListAsModified(sourceNoteId);

        const targetEntry = document.getElementById('entry' + targetNoteId);
        if (targetEntry && targetEntry.getAttribute('data-note-type') === 'tasklist') {
            saveAndRenderTasks(targetNoteId, targetTasks);
        }

        if (typeof closeModal === 'function') {
            closeModal('moveTaskModal');
        }
    } catch (e) {
        if (window.modalAlert) {
            window.modalAlert.alert(
                window.t ? window.t('tasklist.move_error', null, 'Unable to move task') : 'Unable to move task',
                'error'
            );
        }
    } finally {
        if (spinner && typeof spinner.close === 'function') spinner.close();
    }
}

// Offer to create a task list named after the search query when no existing
// list has that exact name (used by the task-list picker modal)
function appendCreateTaskListRow(listEl, notes, query, onCreated) {
    const name = (query || '').trim();
    if (!name) return;

    const exists = (notes || []).some(n => (n.heading || '').trim().toLowerCase() === name.toLowerCase());
    if (exists) return;

    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'move-task-item move-task-create';

    const icon = document.createElement('i');
    icon.className = 'lucide lucide-plus';
    item.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = (window.t ? window.t('modals.task_move.create_new', null, 'Create task list') : 'Create task list')
        + ' "' + name + '"';
    item.appendChild(label);

    item.addEventListener('click', async function() {
        if (item.disabled) return;
        item.disabled = true;
        try {
            const created = await createNamedTaskListNote(name);
            onCreated(created);
        } catch (e) {
            item.disabled = false;
            if (window.modalAlert) {
                window.modalAlert.alert(
                    window.t ? window.t('modals.task_move.create_error', null, 'Unable to create task list') : 'Unable to create task list',
                    'error'
                );
            }
        }
    });

    listEl.appendChild(item);
}

// Named to avoid the global createTaskListNote from notes.js/index-events.js
// (the toolbar action that creates an empty "New note" tasklist and navigates)
async function createNamedTaskListNote(heading) {
    const workspace = getCurrentWorkspace();
    const response = await fetch('/api/v1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ heading: heading, type: 'tasklist', content: '[]', workspace: workspace })
    });
    const data = await response.json();
    if (!data || !data.success || !data.note) {
        throw new Error('create task list failed');
    }
    return { id: data.note.id, heading: data.note.heading || heading };
}

window.poznoteAppendCreateTaskListRow = appendCreateTaskListRow;
window.poznoteCreateTaskListNote = createNamedTaskListNote;
