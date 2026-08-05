(function () {
    'use strict';

    function getConfig() {
        var body = document.body;
        return {
            workspace: body.getAttribute('data-workspace') || '',
            txtError: body.getAttribute('data-txt-error') || 'Error',
            txtUntitled: body.getAttribute('data-txt-untitled') || 'Untitled',
            txtProgress: body.getAttribute('data-txt-progress') || '{{completed}} of {{total}} tasks completed',
            txtNoFilterResults: body.getAttribute('data-txt-no-filter-results') || 'No notes match your search.',
            txtEmptyFiltered: body.getAttribute('data-txt-empty-filtered') || 'No tasks match this filter.',
            txtDue: body.getAttribute('data-txt-due') || 'Due date',
            txtDueRemove: body.getAttribute('data-txt-due-remove') || 'Remove due date',
            txtDueRemoveTime: body.getAttribute('data-txt-due-remove-time') || 'Remove time'
        };
    }

    var config = getConfig();
    var taskNotes = [];
    var filterText = '';
    var filterMode = 'all';

    // Same per-tab editor session identity as note-edit-lock.js, so saving
    // from this page cooperates with the note edit-lock system.
    function getEditorSessionId() {
        try {
            var existing = sessionStorage.getItem('poznote_editor_session_id');
            if (existing) return existing;
            var created = 'editor-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem('poznote_editor_session_id', created);
            return created;
        } catch (e) {
            return '';
        }
    }

    function localDateStringToday() {
        var now = new Date();
        return now.getFullYear() + '-'
            + String(now.getMonth() + 1).padStart(2, '0') + '-'
            + String(now.getDate()).padStart(2, '0');
    }

    // Due dates are 'YYYY-MM-DD' with an optional local time: 'YYYY-MM-DDTHH:MM'
    function dueTimePart(dueAt) {
        return (dueAt && dueAt.length > 10) ? dueAt.substring(11, 16) : '';
    }

    function isOverdue(task) {
        if (!task.dueAt || task.completed) return false;

        if (task.dueAt.length > 10) {
            var now = new Date();
            var nowStr = localDateStringToday() + 'T'
                + String(now.getHours()).padStart(2, '0') + ':'
                + String(now.getMinutes()).padStart(2, '0');
            return task.dueAt < nowStr;
        }

        return task.dueAt < localDateStringToday();
    }

    function formatDueDate(dueAt) {
        if (!dueAt) return '';
        var date = new Date(
            parseInt(dueAt.substring(0, 4), 10),
            parseInt(dueAt.substring(5, 7), 10) - 1,
            parseInt(dueAt.substring(8, 10), 10),
            dueAt.length > 10 ? parseInt(dueAt.substring(11, 13), 10) : 0,
            dueAt.length > 10 ? parseInt(dueAt.substring(14, 16), 10) : 0
        );
        var dateText = (typeof window.poznoteFormatDateOnly === 'function')
            ? window.poznoteFormatDateOnly(date)
            : date.toLocaleDateString();
        if (dueAt.length > 10) {
            var timeText = (typeof window.poznoteFormatTimeOnly === 'function')
                ? window.poznoteFormatTimeOnly(date)
                : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return dateText + ' ' + timeText;
        }
        return dateText;
    }

    function loadTasks() {
        var spinner = document.getElementById('loadingSpinner');
        var container = document.getElementById('tasksNotesContainer');
        var emptyMessage = document.getElementById('emptyMessage');

        if (spinner) spinner.style.display = 'block';
        if (container) container.innerHTML = '';
        if (emptyMessage) emptyMessage.style.display = 'none';

        var params = new URLSearchParams();
        if (config.workspace) {
            params.append('workspace', config.workspace);
        }

        fetch('api/v1/tasks?' + params.toString())
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.error) throw new Error(data.error);

                taskNotes = (data.notes || []).filter(function (note) {
                    return Array.isArray(note.tasks);
                });
                if (spinner) spinner.style.display = 'none';

                var total = countAllTasks();
                if (total === 0) {
                    if (emptyMessage) emptyMessage.style.display = 'block';
                    updateProgress();
                    return;
                }

                render();
            })
            .catch(function (error) {
                if (spinner) spinner.style.display = 'none';
                if (container) {
                    var errDiv = document.createElement('div');
                    errDiv.className = 'error-message';
                    errDiv.textContent = config.txtError + ': ' + error.message;
                    container.innerHTML = '';
                    container.appendChild(errDiv);
                }
            });
    }

    function countAllTasks() {
        return taskNotes.reduce(function (sum, note) { return sum + note.tasks.length; }, 0);
    }

    function countCompletedTasks() {
        return taskNotes.reduce(function (sum, note) {
            return sum + note.tasks.filter(function (t) { return t.completed; }).length;
        }, 0);
    }

    function updateProgress() {
        var section = document.getElementById('tasksProgressSection');
        var label = document.getElementById('tasksProgressLabel');
        var fill = document.getElementById('tasksProgressFill');
        var bar = document.getElementById('tasksProgressBar');
        if (!section) return;

        var total = countAllTasks();
        var completed = countCompletedTasks();
        var percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        section.style.display = 'block';
        if (label) {
            label.textContent = config.txtProgress
                .replace('{{completed}}', completed)
                .replace('{{total}}', total) + ' (' + percent + '%)';
        }
        if (fill) fill.style.width = percent + '%';
        if (bar) bar.setAttribute('aria-valuenow', String(percent));
    }

    function taskMatchesMode(task) {
        switch (filterMode) {
            case 'open': return !task.completed;
            case 'important': return !!task.important && !task.completed;
            case 'overdue': return isOverdue(task);
            case 'dated': return !!task.dueAt;
            case 'completed': return !!task.completed;
            default: return true;
        }
    }

    function getFilteredNotes() {
        return taskNotes.map(function (note) {
            var heading = (note.heading || '').toLowerCase();
            var folder = (note.folder || '').toLowerCase();
            var noteMatchesText = !filterText || heading.includes(filterText) || folder.includes(filterText);

            var tasks = note.tasks.filter(function (task) {
                if (!taskMatchesMode(task)) return false;
                if (!filterText) return true;
                return noteMatchesText || (task.text || '').toLowerCase().includes(filterText);
            });

            return { note: note, tasks: tasks };
        }).filter(function (group) {
            return group.tasks.length > 0;
        });
    }

    function buildNoteUrl(noteId) {
        return 'index.php?note=' + noteId
            + (config.workspace ? '&workspace=' + encodeURIComponent(config.workspace) : '');
    }

    function render() {
        updateProgress();

        var container = document.getElementById('tasksNotesContainer');
        if (!container) return;
        container.innerHTML = '';

        var groups = getFilteredNotes();

        if (groups.length === 0) {
            var msg = filterText ? config.txtNoFilterResults : config.txtEmptyFiltered;
            container.innerHTML = '<div class="empty-message"><p></p></div>';
            container.querySelector('p').textContent = msg;
            return;
        }

        groups.forEach(function (group) {
            var note = group.note;

            var section = document.createElement('section');
            section.className = 'tasks-note-group';

            var header = document.createElement('div');
            header.className = 'tasks-note-header';

            var link = document.createElement('a');
            link.className = 'note-name';
            link.href = buildNoteUrl(note.id);
            link.textContent = note.heading || config.txtUntitled;
            header.appendChild(link);

            if (note.folder) {
                var badge = document.createElement('span');
                badge.className = 'folder-badge';
                badge.innerHTML = '<i class="lucide lucide-folder"></i> ';
                badge.appendChild(document.createTextNode(note.folder));
                header.appendChild(badge);
            }

            var count = document.createElement('span');
            count.className = 'tasks-note-count';
            var done = note.tasks.filter(function (t) { return t.completed; }).length;
            count.textContent = done + ' / ' + note.tasks.length;
            header.appendChild(count);

            section.appendChild(header);

            var list = document.createElement('div');
            list.className = 'tasks-note-list';

            group.tasks.forEach(function (task) {
                list.appendChild(renderTaskRow(note, task));
            });

            section.appendChild(list);
            container.appendChild(section);
        });
    }

    function renderTaskRow(note, task) {
        var row = document.createElement('div');
        row.className = 'tasks-task-item'
            + (task.completed ? ' completed' : '')
            + (task.important && !task.completed ? ' important' : '');

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'tasks-task-checkbox';
        checkbox.checked = !!task.completed;
        checkbox.addEventListener('change', function () {
            toggleTask(note, task, checkbox);
        });
        row.appendChild(checkbox);

        var text = document.createElement('span');
        text.className = 'tasks-task-text';
        text.textContent = task.text || '';
        row.appendChild(text);

        if (task.important && !task.completed) {
            var star = document.createElement('i');
            star.className = 'lucide lucide-star tasks-task-star';
            row.appendChild(star);
        }

        if (task.dueAt) {
            var due = document.createElement('button');
            due.type = 'button';
            due.className = 'task-due-chip' + (isOverdue(task) ? ' overdue' : '');
            due.title = config.txtDue;
            due.innerHTML = '<i class="lucide lucide-calendar-alt"></i>';
            due.appendChild(document.createTextNode(formatDueDate(task.dueAt)));
            due.addEventListener('click', function (e) {
                openDueDatePicker(note, task, due, e);
            });
            row.appendChild(due);
        } else if (!task.completed) {
            var addDue = document.createElement('button');
            addDue.type = 'button';
            addDue.className = 'tasks-task-due-btn';
            addDue.title = config.txtDue;
            addDue.innerHTML = '<i class="lucide lucide-calendar-alt"></i>';
            addDue.addEventListener('click', function (e) {
                openDueDatePicker(note, task, addDue, e);
            });
            row.appendChild(addDue);
        }

        return row;
    }

    // Open the shared calendar popup to change or remove a task's due date
    function openDueDatePicker(note, task, anchorEl, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (typeof window.showSlashDatePicker !== 'function') return;

        var anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null;

        var applyDueAt = function (value) {
            mutateTaskInNote(note, task, function (target) { target.dueAt = value; })
                .then(function () {
                    task.dueAt = value;
                    render();
                })
                .catch(function () { });
        };

        var pickerOptions = {
            withTime: true,
            initialTime: dueTimePart(task.dueAt),
            initialDate: task.dueAt ? task.dueAt.substring(0, 10) : null,
            removeTimeLabel: config.txtDueRemoveTime
        };
        if (task.dueAt) {
            pickerOptions.removeLabel = config.txtDueRemove;
            pickerOptions.onRemove = function () { applyDueAt(null); };
        }

        window.showSlashDatePicker(anchorRect, function (date, time) {
            var day = date.getFullYear() + '-'
                + String(date.getMonth() + 1).padStart(2, '0') + '-'
                + String(date.getDate()).padStart(2, '0');
            applyDueAt(time ? (day + 'T' + time) : day);
        }, null, pickerOptions);
    }

    // Apply a mutation to one task of a note by rewriting the note content
    // through the notes API (same read-modify-write flow as moving a task
    // between lists). Returns a promise that resolves when the save succeeded.
    function mutateTaskInNote(note, task, mutate) {
        var workspaceParam = 'workspace=' + encodeURIComponent(config.workspace);

        return fetch('api/v1/notes/' + note.id + '?' + workspaceParam)
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (!data || !data.success || !data.note || data.note.type !== 'tasklist') {
                    throw new Error(config.txtError);
                }

                var tasks;
                try {
                    tasks = JSON.parse(data.note.content || '[]');
                } catch (e) {
                    tasks = [];
                }
                if (!Array.isArray(tasks)) tasks = [];

                var target = tasks.find(function (t) { return String(t.id) === String(task.id); });
                if (!target) {
                    throw new Error(config.txtError);
                }
                mutate(target);

                var editorSessionId = getEditorSessionId();
                var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
                var payload = { content: JSON.stringify(tasks) };
                if (editorSessionId) {
                    headers['X-Editor-Session-ID'] = editorSessionId;
                    payload.editor_session_id = editorSessionId;
                }

                return fetch('api/v1/notes/' + note.id, {
                    method: 'PATCH',
                    headers: headers,
                    credentials: 'same-origin',
                    body: JSON.stringify(payload)
                });
            })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (!data || !data.success) {
                    throw new Error(config.txtError);
                }
            });
    }

    function toggleTask(note, task, checkbox) {
        var newCompleted = checkbox.checked;
        checkbox.disabled = true;

        mutateTaskInNote(note, task, function (target) { target.completed = newCompleted; })
            .then(function () {
                task.completed = newCompleted;
                render();
            })
            .catch(function () {
                checkbox.checked = !newCompleted;
                checkbox.disabled = false;
            });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var backHomeBtn = document.getElementById('backToHomeBtn');
        if (backHomeBtn) {
            backHomeBtn.addEventListener('click', function () {
                window.location.href = 'dashboard.php';
            });
        }

        var backNotesBtn = document.getElementById('backToNotesBtn');
        if (backNotesBtn) {
            backNotesBtn.addEventListener('click', function () {
                var url = 'index.php' + (config.workspace ? '?workspace=' + encodeURIComponent(config.workspace) : '');
                window.location.href = url;
            });
        }

        var chips = document.getElementById('tasksFilterChips');
        if (chips) {
            chips.addEventListener('click', function (e) {
                var chip = e.target.closest('.tasks-filter-chip');
                if (!chip) return;
                filterMode = chip.getAttribute('data-filter') || 'all';
                chips.querySelectorAll('.tasks-filter-chip').forEach(function (el) {
                    el.classList.toggle('active', el === chip);
                });
                render();
            });
        }

        var filterInput = document.getElementById('filterInput');
        if (filterInput) {
            filterInput.addEventListener('input', function () {
                filterText = this.value.trim().toLowerCase();
                render();
                document.getElementById('clearFilterBtn').style.display = filterText ? 'flex' : 'none';
            });
        }

        var clearFilterBtn = document.getElementById('clearFilterBtn');
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function () {
                filterInput.value = '';
                filterText = '';
                render();
                clearFilterBtn.style.display = 'none';
                filterInput.focus();
            });
        }

        // Quick-task modal (shared with the /task slash command in notes)
        var addTaskBtn = document.getElementById('addTaskBtn');
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', function () {
                if (typeof window.openQuickTaskModal === 'function') {
                    window.openQuickTaskModal();
                }
            });
        }

        // Minimal close-modal delegation (modals-events.js is not loaded here)
        document.addEventListener('click', function (e) {
            var closeBtn = e.target.closest('[data-action="close-modal"]');
            if (closeBtn) {
                var modal = document.getElementById(closeBtn.getAttribute('data-modal'));
                if (modal) modal.style.display = 'none';
            }
        });

        // Refresh the list when a task was added through the modal
        document.addEventListener('poznote-quick-task-added', function () {
            loadTasks();
        });

        loadTasks();
    });
})();
