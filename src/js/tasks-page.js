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
            txtCollapse: body.getAttribute('data-txt-collapse') || 'Collapse',
            txtExpand: body.getAttribute('data-txt-expand') || 'Expand',
            txtDue: body.getAttribute('data-txt-due') || 'Due date',
            txtDueRemove: body.getAttribute('data-txt-due-remove') || 'Remove due date',
            txtDueRemoveTime: body.getAttribute('data-txt-due-remove-time') || 'Remove time',
            txtCalNoTasks: body.getAttribute('data-txt-cal-no-tasks') || 'No tasks on this day.',
            txtNoteBadge: body.getAttribute('data-txt-note-badge') || 'Note',
            txtNoteBadgeTitle: body.getAttribute('data-txt-note-badge-title') || 'Checklist items of a note'
        };
    }

    // Groups come from two sources: tasklist notes (source 'tasklist', full
    // task objects with due dates, importance...) and the checklists found in
    // regular HTML/markdown notes (source 'checklist', plain text + completed
    // only, toggled by rewriting the note content)
    function isChecklistNote(note) {
        return !!note && note.source === 'checklist';
    }

    var config = getConfig();
    var taskNotes = [];
    var filterText = '';
    var filterMode = 'all';

    // View mode ('list' or 'calendar'), persisted per user across visits
    var VIEW_KEY = 'poznote-tasks-page-view';

    // Calendar view state: displayed month and the day whose tasks are
    // listed in the day modal
    var calYear = null;
    var calMonth = null;
    var selectedDay = null;

    // Insert-order preference (same setting as tasklist notes); drives where a
    // newly completed task lands inside the completed group
    var tasklistInsertOrder = 'bottom';

    function refreshTasklistInsertOrder() {
        fetch('api/v1/settings/tasklist_insert_order', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.success && (data.value === 'top' || data.value === 'bottom')) {
                    tasklistInsertOrder = data.value;
                }
            })
            .catch(function () { });
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Convert plain-text URLs into anchors (same behavior as tasklist notes)
    function linkifyTaskText(text) {
        if (!text) return '';
        var urlRegex = /((https?:\/\/)[^\s"'<>]+)|(www\.[^\s"'<>]+)/ig;
        return escapeHtml(text).replace(urlRegex, function (m) {
            var href = /^https?:\/\//i.test(m) ? m : 'http://' + m;
            var displayText = m.length > 50 ? m.substring(0, 47) + '...' : m;
            return '<a href="' + href + '" target="_blank" rel="noopener noreferrer" title="' + m + '">' + displayText + '</a>';
        });
    }

    // Same grouping/order rules as toggleTask in tasklist.js: important
    // incomplete first, normal incomplete, then completed (a newly completed
    // task goes to the start of the completed group in bottom-insert mode)
    function reorderTasksAfterToggle(tasks, toggledTask) {
        var important = [], normal = [], completed = [];
        tasks.forEach(function (t) {
            if (String(t.id) === String(toggledTask.id)) return;
            if (t.completed) completed.push(t);
            else if (t.important) important.push(t);
            else normal.push(t);
        });

        if (toggledTask.completed) {
            if (tasklistInsertOrder === 'bottom') completed.unshift(toggledTask);
            else completed.push(toggledTask);
        } else if (toggledTask.important) {
            important.push(toggledTask);
        } else {
            normal.push(toggledTask);
        }

        return [].concat(important, normal, completed);
    }

    // Per-note collapsed state, persisted per user across visits
    var COLLAPSED_KEY = 'poznote-tasks-page-collapsed';

    function getPrefsStorage() {
        return window.__poznoteUserStorage || window.localStorage;
    }

    function loadCollapsedNoteIds() {
        try {
            var parsed = JSON.parse(getPrefsStorage().getItem(COLLAPSED_KEY) || '[]');
            return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
        } catch (e) {
            return new Set();
        }
    }

    var collapsedNoteIds = loadCollapsedNoteIds();

    function saveCollapsedNoteIds() {
        try {
            getPrefsStorage().setItem(COLLAPSED_KEY, JSON.stringify(Array.from(collapsedNoteIds)));
        } catch (e) { }
    }

    function loadViewMode() {
        try {
            var stored = getPrefsStorage().getItem(VIEW_KEY);
            return stored === 'calendar' ? 'calendar' : 'list';
        } catch (e) {
            return 'list';
        }
    }

    var viewMode = loadViewMode();

    function saveViewMode() {
        try {
            getPrefsStorage().setItem(VIEW_KEY, viewMode);
        } catch (e) { }
    }

    // "Display tasks in notes" toggle (checklists of regular notes), on by
    // default and persisted per user across visits
    var SHOW_NOTE_CHECKLISTS_KEY = 'poznote-tasks-page-show-note-checklists';

    function loadShowNoteChecklists() {
        try {
            return getPrefsStorage().getItem(SHOW_NOTE_CHECKLISTS_KEY) !== '0';
        } catch (e) {
            return true;
        }
    }

    var showNoteChecklists = loadShowNoteChecklists();

    function saveShowNoteChecklists() {
        try {
            getPrefsStorage().setItem(SHOW_NOTE_CHECKLISTS_KEY, showNoteChecklists ? '1' : '0');
        } catch (e) { }
    }

    // Groups currently taken into account (counts, progress, lists)
    function getActiveNotes() {
        return showNoteChecklists ? taskNotes : taskNotes.filter(function (note) {
            return !isChecklistNote(note);
        });
    }

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

                var tasklistNotes = (data.notes || []).filter(function (note) {
                    return Array.isArray(note.tasks);
                }).map(function (note) {
                    note.source = 'tasklist';
                    return note;
                });
                var checklistNotes = (data.checklists || []).filter(function (note) {
                    return Array.isArray(note.tasks);
                }).map(function (note) {
                    note.source = 'checklist';
                    return note;
                });
                // Both lists come back most recently updated first; keep that
                // order across sources
                taskNotes = tasklistNotes.concat(checklistNotes).sort(function (a, b) {
                    return String(b.updated || '').localeCompare(String(a.updated || ''));
                });
                if (spinner) spinner.style.display = 'none';

                // Empty state only when there is nothing at all, whatever the
                // "Display tasks in notes" toggle says
                var total = taskNotes.reduce(function (sum, note) { return sum + note.tasks.length; }, 0);
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
        return getActiveNotes().reduce(function (sum, note) { return sum + note.tasks.length; }, 0);
    }

    function countCompletedTasks() {
        return getActiveNotes().reduce(function (sum, note) {
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

        // Let the stylesheet drive the layout (flex row on desktop, block on
        // mobile) instead of forcing an inline display
        section.classList.remove('initially-hidden');
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
        return getActiveNotes().map(function (note) {
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

    function syncViewUi() {
        var toggle = document.getElementById('tasksViewToggle');
        if (toggle) {
            toggle.querySelectorAll('.tasks-view-btn').forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-view') === viewMode);
            });
        }
        var container = document.querySelector('.tasks-container');
        if (container) container.classList.toggle('view-calendar', viewMode === 'calendar');
    }

    function render() {
        updateProgress();
        syncViewUi();

        var container = document.getElementById('tasksNotesContainer');
        if (!container) return;
        container.innerHTML = '';

        if (viewMode === 'calendar') {
            renderCalendarView(container);
        } else {
            renderListView(container);
        }

        // Resolve [[Note Title]] references into clickable links
        if (typeof window.processNoteReferences === 'function') {
            window.processNoteReferences(container, config.workspace);
        }
    }

    function renderListView(container) {
        var groups = getFilteredNotes();

        if (groups.length === 0) {
            var msg = filterText ? config.txtNoFilterResults : config.txtEmptyFiltered;
            container.innerHTML = '<div class="empty-message"><p></p></div>';
            container.querySelector('p').textContent = msg;
            return;
        }

        groups.forEach(function (group) {
            var note = group.note;
            var isCollapsed = collapsedNoteIds.has(String(note.id));

            var section = document.createElement('section');
            section.className = 'tasks-note-group' + (isCollapsed ? ' collapsed' : '');

            var header = document.createElement('div');
            header.className = 'tasks-note-header';

            var toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'tasks-note-toggle';
            toggle.title = isCollapsed ? config.txtExpand : config.txtCollapse;
            toggle.setAttribute('aria-expanded', String(!isCollapsed));
            toggle.innerHTML = '<i class="lucide lucide-chevron-down"></i>';
            toggle.addEventListener('click', function () {
                var nowCollapsed = section.classList.toggle('collapsed');
                if (nowCollapsed) {
                    collapsedNoteIds.add(String(note.id));
                } else {
                    collapsedNoteIds.delete(String(note.id));
                }
                toggle.title = nowCollapsed ? config.txtExpand : config.txtCollapse;
                toggle.setAttribute('aria-expanded', String(!nowCollapsed));
                saveCollapsedNoteIds();
            });
            header.appendChild(toggle);

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

            // Checklists of regular notes are told apart from tasklist notes
            if (isChecklistNote(note)) {
                var sourceBadge = document.createElement('span');
                sourceBadge.className = 'tasks-note-source-badge';
                sourceBadge.title = config.txtNoteBadgeTitle;
                sourceBadge.innerHTML = '<i class="lucide lucide-file-text"></i> ';
                sourceBadge.appendChild(document.createTextNode(config.txtNoteBadge));
                header.appendChild(sourceBadge);
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

    function renderTaskRow(note, task, opts) {
        var row = document.createElement('div');
        row.className = 'tasks-task-item'
            + (task.completed ? ' completed' : '')
            + (task.important && !task.completed ? ' important' : '')
            + (task.dueAt ? ' has-due' : '');

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
        text.innerHTML = linkifyTaskText(task.text);
        row.appendChild(text);

        // Clicking the row (outside links, the checkbox and the due-date
        // controls) opens the task's note
        row.addEventListener('click', function (e) {
            if (e.target.closest('a, button, input')) return;
            window.location.href = buildNoteUrl(note.id);
        });

        // Agenda rows mix tasks from several notes; show which note each
        // task belongs to (the row click still opens that note)
        if (opts && opts.showNote) {
            var noteBadge = document.createElement('span');
            noteBadge.className = 'tasks-task-note-badge';
            noteBadge.textContent = note.heading || config.txtUntitled;
            row.appendChild(noteBadge);
        }

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
            // Day-modal rows drop the date (it is already the modal title):
            // show the time alone, or just an icon for all-day tasks
            var timeOnly = opts && opts.dueTimeOnly;
            var dueLabel = timeOnly ? formatDueTime(task.dueAt) : formatDueDate(task.dueAt);
            due.innerHTML = '<i class="lucide ' + (timeOnly && dueLabel ? 'lucide-clock' : 'lucide-calendar-alt') + '"></i>';
            if (dueLabel) due.appendChild(document.createTextNode(dueLabel));
            if (task.dueReminder) {
                var bell = document.createElement('i');
                bell.className = 'lucide lucide-bell';
                due.appendChild(bell);
            }
            due.addEventListener('click', function (e) {
                openDueDatePicker(note, task, due, e);
            });
            row.appendChild(due);
        } else if (!task.completed && !isChecklistNote(note)) {
            // Checklist items of regular notes carry no due date
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

    /* ------------------------------------------------------------------ */
    /* Calendar view: month grid of dated tasks. Clicking a day (chips    */
    /* included) opens a modal listing that day's tasks; chips can be     */
    /* dragged to another day to reschedule.                              */
    /* ------------------------------------------------------------------ */

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatDueTime(dueAt) {
        if (!dueAt || dueAt.length <= 10) return '';
        var date = new Date(2000, 0, 1, parseInt(dueAt.substring(11, 13), 10), parseInt(dueAt.substring(14, 16), 10));
        return (typeof window.poznoteFormatTimeOnly === 'function')
            ? window.poznoteFormatTimeOnly(date)
            : dueAt.substring(11, 16);
    }

    // Dated tasks of the filtered notes bucketed by 'YYYY-MM-DD' day,
    // all-day tasks first, then by time
    function getTasksByDay() {
        var byDay = {};
        getFilteredNotes().forEach(function (group) {
            group.tasks.forEach(function (task) {
                if (!task.dueAt) return;
                var key = task.dueAt.substring(0, 10);
                (byDay[key] = byDay[key] || []).push({ note: group.note, task: task });
            });
        });
        Object.keys(byDay).forEach(function (key) {
            byDay[key].sort(function (a, b) {
                return dueTimePart(a.task.dueAt).localeCompare(dueTimePart(b.task.dueAt));
            });
        });
        return byDay;
    }

    function ensureCalendarDate() {
        if (calYear !== null) return;
        var now = new Date();
        calYear = now.getFullYear();
        calMonth = now.getMonth();
        selectedDay = localDateStringToday();
    }

    function shiftCalendarMonth(delta) {
        var d = new Date(calYear, calMonth + delta, 1);
        calYear = d.getFullYear();
        calMonth = d.getMonth();
        render();
    }

    // Task currently dragged from one day cell towards another
    var dragEntry = null;

    // A due date moved from the calendar keeps its pending reminder in sync
    // (same materialization as the due-date modal)
    function rematerializeReminder(note, task) {
        if (!task.dueReminder || !task.dueAt) return;
        var day = task.dueAt.substring(0, 10);
        var time = task.dueAt.length > 10 ? task.dueAt.substring(11, 16) : '09:00';
        var trigger = new Date(
            parseInt(day.substring(0, 4), 10),
            parseInt(day.substring(5, 7), 10) - 1,
            parseInt(day.substring(8, 10), 10),
            parseInt(time.substring(0, 2), 10),
            parseInt(time.substring(3, 5), 10)
        ).toISOString();
        fetch('api/v1/notes/' + note.id + '/task-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                task_id: String(task.id),
                reminder_at: trigger,
                message: task.text,
                email_enabled: task.dueReminderEmail !== undefined ? !!task.dueReminderEmail : true,
                recurrence: task.dueRecurrence || null
            })
        }).catch(function () { });
    }

    function attachDropTarget(cell) {
        cell.addEventListener('dragover', function (e) {
            if (!dragEntry) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cell.classList.add('drag-over');
        });
        cell.addEventListener('dragleave', function () {
            cell.classList.remove('drag-over');
        });
        cell.addEventListener('drop', function (e) {
            cell.classList.remove('drag-over');
            if (!dragEntry) return;
            e.preventDefault();
            var entry = dragEntry;
            dragEntry = null;
            var day = cell.getAttribute('data-day');
            if (!day || !entry.task.dueAt || entry.task.dueAt.substring(0, 10) === day) return;
            var time = dueTimePart(entry.task.dueAt);
            var newDueAt = time ? day + 'T' + time : day;
            mutateTaskInNote(entry.note, entry.task, function (target) { target.dueAt = newDueAt; })
                .then(function () {
                    entry.task.dueAt = newDueAt;
                    rematerializeReminder(entry.note, entry.task);
                    render();
                })
                .catch(function () { });
        });
    }

    function renderCalendarChip(note, task) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tasks-cal-chip'
            + (task.completed ? ' completed' : '')
            + (task.important && !task.completed ? ' important' : '')
            + (isOverdue(task) ? ' overdue' : '');
        chip.title = (task.text || '') + ' · ' + (note.heading || config.txtUntitled);

        var time = formatDueTime(task.dueAt);
        if (time) {
            var timeEl = document.createElement('span');
            timeEl.className = 'tasks-cal-chip-time';
            timeEl.textContent = time;
            chip.appendChild(timeEl);
        }

        var textEl = document.createElement('span');
        textEl.className = 'tasks-cal-chip-text';
        textEl.textContent = task.text;
        chip.appendChild(textEl);

        chip.draggable = true;
        chip.addEventListener('dragstart', function (e) {
            dragEntry = { note: note, task: task };
            chip.classList.add('dragging');
            try {
                e.dataTransfer.setData('text/plain', task.text || '');
                e.dataTransfer.effectAllowed = 'move';
            } catch (err) { }
        });
        chip.addEventListener('dragend', function () {
            dragEntry = null;
            chip.classList.remove('dragging');
        });

        return chip;
    }

    function isDayModalOpen() {
        var modal = document.getElementById('calDayModal');
        return !!modal && modal.style.display === 'flex';
    }

    // Human-friendly localized title for the day modal ("jeudi 13 août 2026"),
    // same Intl pattern as the notes calendar modal
    function formatDayModalTitle(day) {
        var date = new Date(
            parseInt(day.substring(0, 4), 10),
            parseInt(day.substring(5, 7), 10) - 1,
            parseInt(day.substring(8, 10), 10)
        );
        var text;
        try {
            text = new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }).format(date);
        } catch (e) {
            return formatDueDate(day);
        }
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    // Fill the day modal with the selected day's tasks (rows behave like the
    // list view: checkbox toggles, due chip opens the due-date modal)
    function fillDayModal(byDay) {
        if (!selectedDay) return;

        var title = document.getElementById('calDayModalTitle');
        if (title) title.textContent = formatDayModalTitle(selectedDay);

        var list = document.getElementById('calDayModalList');
        if (!list) return;
        list.innerHTML = '';

        var entries = byDay[selectedDay] || [];
        if (entries.length === 0) {
            var msg = document.createElement('p');
            msg.className = 'tasks-cal-modal-empty';
            msg.textContent = config.txtCalNoTasks;
            list.appendChild(msg);
            return;
        }

        var rows = document.createElement('div');
        rows.className = 'tasks-note-list';
        entries.forEach(function (entry) {
            rows.appendChild(renderTaskRow(entry.note, entry.task, { showNote: true, dueTimeOnly: true }));
        });
        list.appendChild(rows);

        // Resolve [[Note Title]] references (the modal lives outside the
        // container processed by render())
        if (typeof window.processNoteReferences === 'function') {
            window.processNoteReferences(list, config.workspace);
        }
    }

    function openDayModal(day) {
        var modal = document.getElementById('calDayModal');
        if (!modal) return;
        selectedDay = day;
        render();
        fillDayModal(getTasksByDay());
        modal.style.display = 'flex';
    }

    function renderCalendarView(container) {
        ensureCalendarDate();
        var t9n = window.calendarTranslations || {};
        var months = t9n.months || [];
        var weekdays = t9n.weekdays || ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
        var byDay = getTasksByDay();
        var todayKey = localDateStringToday();

        var cal = document.createElement('div');
        cal.className = 'tasks-calendar';

        var header = document.createElement('div');
        header.className = 'tasks-cal-header';

        var prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'tasks-cal-nav';
        prevBtn.title = t9n.previousMonth || 'Previous month';
        prevBtn.innerHTML = '<i class="lucide lucide-chevron-left"></i>';
        prevBtn.addEventListener('click', function () { shiftCalendarMonth(-1); });
        header.appendChild(prevBtn);

        var title = document.createElement('span');
        title.className = 'tasks-cal-title';
        title.textContent = (months[calMonth] || '') + ' ' + calYear;
        header.appendChild(title);

        var nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'tasks-cal-nav';
        nextBtn.title = t9n.nextMonth || 'Next month';
        nextBtn.innerHTML = '<i class="lucide lucide-chevron-right"></i>';
        nextBtn.addEventListener('click', function () { shiftCalendarMonth(1); });
        header.appendChild(nextBtn);

        var todayBtn = document.createElement('button');
        todayBtn.type = 'button';
        todayBtn.className = 'tasks-cal-today-btn';
        todayBtn.textContent = t9n.today || 'Today';
        todayBtn.addEventListener('click', function () {
            var now = new Date();
            calYear = now.getFullYear();
            calMonth = now.getMonth();
            selectedDay = localDateStringToday();
            render();
        });
        header.appendChild(todayBtn);

        cal.appendChild(header);

        var grid = document.createElement('div');
        grid.className = 'tasks-cal-grid';

        weekdays.forEach(function (label) {
            var wd = document.createElement('span');
            wd.className = 'tasks-cal-weekday';
            wd.textContent = label;
            grid.appendChild(wd);
        });

        // Full weeks, Monday-first (same convention as the date picker):
        // leading and trailing other-month days stay visible but muted
        var lead = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
        var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        var totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;

        for (var i = 0; i < totalCells; i++) {
            var date = new Date(calYear, calMonth, 1 - lead + i);
            var key = date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());

            var cell = document.createElement('div');
            cell.className = 'tasks-cal-day'
                + (date.getMonth() !== calMonth ? ' other-month' : '')
                + (key === todayKey ? ' today' : '')
                + (key === selectedDay ? ' selected' : '');
            cell.setAttribute('data-day', key);

            var num = document.createElement('span');
            num.className = 'tasks-cal-day-num';
            num.textContent = date.getDate();
            cell.appendChild(num);

            (byDay[key] || []).forEach(function (entry) {
                cell.appendChild(renderCalendarChip(entry.note, entry.task));
            });

            // Chip clicks bubble here too: clicking a task opens its day's
            // modal (due-date edits happen from the modal's rows)
            cell.addEventListener('click', function (e) {
                if (e.target.closest('a')) return;
                openDayModal(this.getAttribute('data-day'));
            });
            attachDropTarget(cell);
            grid.appendChild(cell);
        }

        cal.appendChild(grid);
        container.appendChild(cal);

        // A mutation done from inside the open modal (toggle, due change)
        // re-renders the page; keep the modal's list in sync
        if (isDayModalOpen()) fillDayModal(byDay);
    }

    // Open the shared calendar popup to change or remove a task's due date
    function openDueDatePicker(note, task, anchorEl, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        // Preferred UI: the shared due-date modal (date + time + reminder toggle)
        if (typeof window.openTaskDueModal === 'function' && document.getElementById('taskDueModal')) {
            window.openTaskDueModal({
                noteId: note.id,
                taskId: task.id,
                task: task,
                onSave: function (payload) {
                    return mutateTaskInNote(note, task, function (target) {
                        target.dueAt = payload.dueAt;
                        target.dueReminder = payload.dueReminder;
                        target.dueReminderEmail = payload.dueReminderEmail;
                        target.dueRecurrence = payload.dueRecurrence;
                    }).then(function () {
                        task.dueAt = payload.dueAt;
                        task.dueReminder = payload.dueReminder;
                        task.dueReminderEmail = payload.dueReminderEmail;
                        task.dueRecurrence = payload.dueRecurrence;
                        render();
                    });
                }
            });
            return;
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
    // between lists). The optional transformTasks(tasks, target) hook can
    // reorder the full array before saving. Returns a promise that resolves
    // when the save succeeded.
    function mutateTaskInNote(note, task, mutate, transformTasks) {
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
                if (transformTasks) {
                    tasks = transformTasks(tasks, target);
                }

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

    // Flip the "- [ ]" / "- [x]" marker of one line of a markdown note. The
    // line index is the one the API reported (0-based in the "\n"-split
    // source). Returns null when the line is no longer a task item.
    function toggleMarkdownChecklistLine(content, lineIndex, completed) {
        var lines = String(content || '').split('\n');
        if (lineIndex < 0 || lineIndex >= lines.length) return null;
        var line = lines[lineIndex];
        var match = /^(\s*[*\-+]\s+)\[[ xX]\]/.exec(line);
        if (!match) return null;
        lines[lineIndex] = match[1] + (completed ? '[x]' : '[ ]') + line.slice(match[0].length);
        return lines.join('\n');
    }

    // Flip the n-th checklist checkbox of an HTML note (same ordinal the API
    // used: document order of input.checklist-checkbox), mirroring what
    // js/checklist.js writes when the box is clicked in the editor. Returns
    // null when the checkbox no longer exists.
    function toggleHtmlChecklistItem(content, index, completed) {
        var doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body>' + String(content || '') + '</body></html>', 'text/html');
        var boxes = doc.querySelectorAll('input.checklist-checkbox');
        var box = boxes[index];
        if (!box) return null;
        if (completed) {
            box.setAttribute('checked', 'checked');
            box.setAttribute('data-checked', '1');
        } else {
            box.removeAttribute('checked');
            box.setAttribute('data-checked', '0');
        }
        var item = box.closest('.checklist-item');
        if (item) item.classList.toggle('checklist-item-checked', completed);
        return doc.body.innerHTML;
    }

    // Toggle one checklist item of a regular note by rewriting the note
    // content through the notes API (read-modify-write, like tasklist
    // notes). The item is re-located in the freshly read content, so a
    // stale index (note edited meanwhile) fails instead of flipping the
    // wrong line. Returns a promise that resolves when the save succeeded.
    function mutateChecklistInNote(note, task, completed) {
        var workspaceParam = 'workspace=' + encodeURIComponent(config.workspace);

        return fetch('api/v1/notes/' + note.id + '?' + workspaceParam)
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (!data || !data.success || !data.note) {
                    throw new Error(config.txtError);
                }
                var noteType = data.note.type || 'note';
                var index = parseInt(task.id, 10);
                var newContent = null;
                if (noteType === 'markdown') {
                    newContent = toggleMarkdownChecklistLine(data.note.content, index, completed);
                } else if (noteType === 'note') {
                    newContent = toggleHtmlChecklistItem(data.note.content, index, completed);
                }
                if (newContent === null) {
                    throw new Error(config.txtError);
                }

                var editorSessionId = getEditorSessionId();
                var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
                var payload = { content: newContent };
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

    function toggleChecklistItem(note, task, checkbox) {
        var newCompleted = checkbox.checked;
        checkbox.disabled = true;

        mutateChecklistInNote(note, task, newCompleted)
            .then(function () {
                // Items keep their place in the note, no regrouping
                task.completed = newCompleted;
                render();
            })
            .catch(function () {
                checkbox.checked = !newCompleted;
                checkbox.disabled = false;
            });
    }

    function toggleTask(note, task, checkbox) {
        if (isChecklistNote(note)) {
            toggleChecklistItem(note, task, checkbox);
            return;
        }

        var newCompleted = checkbox.checked;
        checkbox.disabled = true;

        var clearReminder = newCompleted && task.dueReminder;

        mutateTaskInNote(note, task, function (target) {
            target.completed = newCompleted;
            if (clearReminder) target.dueReminder = false;
        }, reorderTasksAfterToggle)
            .then(function () {
                task.completed = newCompleted;
                // Mirror the saved order locally: completed tasks sink to the
                // bottom of their note group, like in the tasklist note
                note.tasks = reorderTasksAfterToggle(note.tasks, task);
                if (clearReminder) {
                    task.dueReminder = false;
                    // Completing a task cancels its pending reminder
                    fetch('api/v1/notes/' + note.id + '/task-reminder', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ task_id: String(task.id) })
                    }).catch(function () { });
                }
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

        function setAllCollapsed(collapsed) {
            collapsedNoteIds = new Set(collapsed ? taskNotes.map(function (note) { return String(note.id); }) : []);
            saveCollapsedNoteIds();
            render();
        }

        var collapseAllBtn = document.getElementById('collapseAllBtn');
        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', function () { setAllCollapsed(true); });
        }

        var expandAllBtn = document.getElementById('expandAllBtn');
        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', function () { setAllCollapsed(false); });
        }

        var viewToggle = document.getElementById('tasksViewToggle');
        if (viewToggle) {
            viewToggle.addEventListener('click', function (e) {
                var btn = e.target.closest('.tasks-view-btn');
                if (!btn) return;
                var mode = btn.getAttribute('data-view') === 'calendar' ? 'calendar' : 'list';
                if (mode === viewMode) return;
                viewMode = mode;
                saveViewMode();
                render();
            });
        }

        var showNotesToggle = document.getElementById('tasksShowNoteChecklists');
        if (showNotesToggle) {
            showNotesToggle.checked = showNoteChecklists;
            showNotesToggle.addEventListener('change', function () {
                showNoteChecklists = showNotesToggle.checked;
                saveShowNoteChecklists();
                render();
            });
        }

        // Reflect the persisted view mode before the first load finishes
        syncViewUi();

        // Minimal close-modal delegation (modals-events.js is not loaded here)
        document.addEventListener('click', function (e) {
            var closeBtn = e.target.closest('[data-action="close-modal"]');
            if (closeBtn) {
                var modal = document.getElementById(closeBtn.getAttribute('data-modal'));
                if (modal) modal.style.display = 'none';
            }
        });

        // The day modal also closes on backdrop click or Escape
        var calDayModal = document.getElementById('calDayModal');
        if (calDayModal) {
            calDayModal.addEventListener('click', function (e) {
                if (e.target === calDayModal) calDayModal.style.display = 'none';
            });
            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape' || calDayModal.style.display !== 'flex') return;
                // The due modal may be stacked on top; close that one first
                var dueModal = document.getElementById('taskDueModal');
                if (dueModal && dueModal.style.display === 'flex') {
                    dueModal.style.display = 'none';
                    return;
                }
                calDayModal.style.display = 'none';
            });
        }

        refreshTasklistInsertOrder();
        loadTasks();
    });
})();
