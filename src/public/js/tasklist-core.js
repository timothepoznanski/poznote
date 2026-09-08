// Task lists: shared state and helpers.
// 
// Reading a note's task data, the save/render cycle, progress, grouping (important
// incomplete, then incomplete, then completed) and due-date formatting. The grouping
// order is mirrored server-side in api/v1/controllers/TasksController.php.

// Task List Management Functions

// --- Helper functions ---

// Parse task data from a note entry's data attribute
function parseTaskData(element) {
    try {
        return JSON.parse(element.dataset.tasklistJson || '[]');
    } catch (e) {
        return [];
    }
}

function isPublicWorkspaceReadOnly() {
    return !!(document.body && document.body.classList.contains('public-workspace-readonly'));
}

function isTaskEditBlurSavePaused(input) {
    return !!(input && input.dataset && input.dataset.taskEditBlurSavePaused === 'true');
}

function pauseTaskEditBlurSave(input) {
    if (input && input.classList && input.classList.contains('task-edit-input')) {
        input.dataset.taskEditBlurSavePaused = 'true';
    }
}

function resumeTaskEditBlurSave(input) {
    if (input && input.dataset) {
        delete input.dataset.taskEditBlurSavePaused;
    }
}

window.pauseTaskEditBlurSave = pauseTaskEditBlurSave;
window.resumeTaskEditBlurSave = resumeTaskEditBlurSave;

// Save tasks to data attribute and re-render the task list
function saveAndRenderTasks(noteId, tasks) {
    const noteEntry = document.getElementById('entry' + noteId);
    if (noteEntry) {
        noteEntry.dataset.tasklistJson = JSON.stringify(tasks);
    }
    const tasksList = document.getElementById('tasks-list-' + noteId);
    if (tasksList) {
        tasksList.innerHTML = renderTasks(tasks, noteId);

        // Process references [[Note Title]] in the newly rendered HTML
        if (typeof window.processNoteReferences === 'function') {
            const workspace = typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : (window.selectedWorkspace || '');
            window.processNoteReferences(tasksList, workspace);
        }

        enableDragAndDrop(noteId);
    }

    updateTaskListProgress(noteId, tasks);
}

// Completion progress bar of a tasklist note (same as the tasks page)
function updateTaskListProgress(noteId, tasks) {
    const section = document.getElementById('tasklist-progress-' + noteId);
    if (!section) return;

    const total = Array.isArray(tasks) ? tasks.length : 0;
    if (total === 0) {
        section.style.display = 'none';
        return;
    }

    const completed = tasks.filter(task => task && task.completed).length;
    const percent = Math.round((completed / total) * 100);

    const template = window.t
        ? window.t('tasks_page.progress', null, '{{completed}} of {{total}} tasks completed')
        : '{{completed}} of {{total}} tasks completed';
    const label = section.querySelector('.tasklist-progress-label');
    if (label) {
        label.textContent = template
            .replace('{{completed}}', completed)
            .replace('{{total}}', total) + ' (' + percent + '%)';
    }

    const fill = section.querySelector('.tasklist-progress-fill');
    if (fill) fill.style.width = percent + '%';

    section.style.display = '';
}

// Group tasks by status: important incomplete, normal incomplete, completed
function groupTasksByStatus(tasks) {
    const important = [], normal = [], completed = [];
    for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (t.completed) completed.push(t);
        else if (t.important) important.push(t);
        else normal.push(t);
    }
    return { important, normal, completed };
}

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
                important: false,
                dueAt: null
            };
        }

        return {
            ...task,
            id: normalizeTaskId(task.id),
            noteId: noteId,
            completed: !!task.completed,
            important: !!task.important,
            text: typeof task.text === 'string' ? task.text : String(task.text ?? ''),
            dueAt: normalizeTaskDueAt(task.dueAt)
        };
    });

    // Persist normalized data for subsequent actions
    noteEntry.dataset.tasklistJson = JSON.stringify(tasks);

    // Replace the contenteditable div with task list interface
    renderTaskList(noteId, tasks);

    // Process references [[Note Title]] in the newly rendered HTML
    const tasksList = document.getElementById('tasks-list-' + noteId);
    if (tasksList && typeof window.processNoteReferences === 'function') {
        const workspace = typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : (window.selectedWorkspace || '');
        window.processNoteReferences(tasksList, workspace);
    }
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

// Due dates are stored as 'YYYY-MM-DD' strings (local calendar date), with an
// optional local time: 'YYYY-MM-DDTHH:MM'.
function normalizeTaskDueAt(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
    if (!match) return null;
    return match[2] ? (match[1] + 'T' + match[2]) : match[1];
}

function taskDueTimePart(dueAt) {
    const normalized = normalizeTaskDueAt(dueAt);
    return (normalized && normalized.length > 10) ? normalized.substring(11, 16) : '';
}

function localDateStringToday() {
    const now = new Date();
    return now.getFullYear() + '-'
        + String(now.getMonth() + 1).padStart(2, '0') + '-'
        + String(now.getDate()).padStart(2, '0');
}

function isTaskDueOverdue(dueAt) {
    const normalized = normalizeTaskDueAt(dueAt);
    if (!normalized) return false;

    // ISO-style local strings compare correctly lexicographically
    if (normalized.length > 10) {
        const now = new Date();
        const nowStr = localDateStringToday() + 'T'
            + String(now.getHours()).padStart(2, '0') + ':'
            + String(now.getMinutes()).padStart(2, '0');
        return normalized < nowStr;
    }

    return normalized < localDateStringToday();
}

function formatTaskDueDate(dueAt) {
    const normalized = normalizeTaskDueAt(dueAt);
    if (!normalized) return '';
    const date = new Date(
        parseInt(normalized.substring(0, 4), 10),
        parseInt(normalized.substring(5, 7), 10) - 1,
        parseInt(normalized.substring(8, 10), 10),
        normalized.length > 10 ? parseInt(normalized.substring(11, 13), 10) : 0,
        normalized.length > 10 ? parseInt(normalized.substring(14, 16), 10) : 0
    );
    const dateText = (typeof window.poznoteFormatDateOnly === 'function')
        ? window.poznoteFormatDateOnly(date)
        : date.toLocaleDateString();
    if (normalized.length > 10) {
        const timeText = (typeof window.poznoteFormatTimeOnly === 'function')
            ? window.poznoteFormatTimeOnly(date)
            : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return dateText + ' ' + timeText;
    }
    return dateText;
}

window.normalizeTaskDueAt = normalizeTaskDueAt;
window.isTaskDueOverdue = isTaskDueOverdue;
window.formatTaskDueDate = formatTaskDueDate;

function escapeAttribute(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function handleTaskLinkClick(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    // event.currentTarget is null for inline onclick attributes; use event.target.closest instead.
    const link = event && event.target ? event.target.closest('a') : null;
    if (!link || !link.href) return false;

    window.open(link.href, '_blank', 'noopener,noreferrer');
    return false;
}

window.handleTaskLinkClick = handleTaskLinkClick;
