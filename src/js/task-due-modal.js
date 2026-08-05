// Due-date modal for tasklist tasks, mirroring the note reminder modal.
// Opened from task rows (note view and tasks page); lets the user pick a
// date, an optional time, and opt into a reminder (notification + optional
// email) that fires at the due date through the notifications system.
(function () {
    'use strict';

    let state = null;

    function el(id) {
        return document.getElementById(id);
    }

    function modalEl() {
        return el('taskDueModal');
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function normalizeDue(value) {
        if (typeof window.normalizeTaskDueAt === 'function') {
            return window.normalizeTaskDueAt(value);
        }
        if (typeof value !== 'string') return null;
        const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
        if (!match) return null;
        return match[2] ? (match[1] + 'T' + match[2]) : match[1];
    }

    function dateFromParts(day, time) {
        return new Date(
            parseInt(day.substring(0, 4), 10),
            parseInt(day.substring(5, 7), 10) - 1,
            parseInt(day.substring(8, 10), 10),
            time ? parseInt(time.substring(0, 2), 10) : 0,
            time ? parseInt(time.substring(3, 5), 10) : 0
        );
    }

    function formatDayLabel(day) {
        const d = dateFromParts(day, '');
        return (typeof window.poznoteFormatDateOnly === 'function')
            ? window.poznoteFormatDateOnly(d)
            : d.toLocaleDateString();
    }

    function formatTimeLabel(time) {
        const d = new Date(2000, 0, 1, parseInt(time.substring(0, 2), 10), parseInt(time.substring(3, 5), 10));
        return (typeof window.poznoteFormatTimeOnly === 'function')
            ? window.poznoteFormatTimeOnly(d)
            : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function emailAvailable() {
        const modal = modalEl();
        return !!(modal && modal.dataset.emailAvailable === '1');
    }

    function syncUi() {
        const modal = modalEl();
        if (!modal || !state) return;

        const dateLabel = el('taskDueDateBtnLabel');
        if (dateLabel) {
            dateLabel.textContent = state.day ? formatDayLabel(state.day) : (modal.dataset.txtDate || 'Date');
        }

        const timeLabel = el('taskDueTimeBtnLabel');
        if (timeLabel) {
            timeLabel.textContent = state.time ? formatTimeLabel(state.time) : (modal.dataset.txtTime || 'Time');
        }

        const remindInput = el('taskDueRemindInput');
        if (remindInput) remindInput.checked = state.remind;

        const emailOption = el('taskDueEmailOption');
        if (emailOption) {
            emailOption.classList.toggle('initially-hidden', !(state.remind && emailAvailable()));
        }
        const emailInput = el('taskDueEmailInput');
        if (emailInput) emailInput.checked = state.email;

        const currentInfo = el('taskDueCurrentInfo');
        const currentDate = el('taskDueCurrentDate');
        if (currentInfo && currentDate) {
            if (state.day) {
                currentDate.textContent = formatDayLabel(state.day) + (state.time ? ' ' + formatTimeLabel(state.time) : '');
                currentInfo.classList.remove('is-empty');
            } else {
                currentDate.textContent = modal.dataset.txtNoDate || 'No date configured';
                currentInfo.classList.add('is-empty');
            }
        }

        const removeBtn = el('taskDueRemoveBtn');
        if (removeBtn) removeBtn.classList.toggle('initially-hidden', !state.hadDue);

        const saveBtn = el('taskDueSaveBtn');
        if (saveBtn) saveBtn.disabled = !state.day && !state.hadDue;
    }

    function closeTaskDueModal() {
        const modal = modalEl();
        if (modal) modal.style.display = 'none';
        state = null;
    }

    function reminderApiCall(payload) {
        // Materialize or clear the task's reminder row through the API
        const noteId = state.noteId;
        const taskId = String(state.taskId);

        if (payload.dueReminder && payload.dueAt) {
            const day = payload.dueAt.substring(0, 10);
            const time = payload.dueAt.length > 10 ? payload.dueAt.substring(11, 16) : '09:00';
            const triggerUtc = dateFromParts(day, time).toISOString();
            return fetch('/api/v1/notes/' + noteId + '/task-reminder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    task_id: taskId,
                    reminder_at: triggerUtc,
                    message: state.taskText,
                    email_enabled: payload.dueReminderEmail
                })
            });
        }

        return fetch('/api/v1/notes/' + noteId + '/task-reminder', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ task_id: taskId })
        });
    }

    function applyAndClose(payload) {
        const onSave = state.onSave;
        Promise.resolve(onSave ? onSave(payload) : null)
            .then(function () { return reminderApiCall(payload); })
            .catch(function () { })
            .then(function () { closeTaskDueModal(); });
    }

    function handleSave() {
        if (!state) return;
        const dueAt = state.day ? (state.day + (state.time ? 'T' + state.time : '')) : null;
        applyAndClose({
            dueAt: dueAt,
            dueReminder: !!(state.remind && dueAt),
            dueReminderEmail: !!(state.remind && state.email && emailAvailable())
        });
    }

    function handleRemove() {
        if (!state) return;
        applyAndClose({ dueAt: null, dueReminder: false, dueReminderEmail: false });
    }

    function openDatePicker() {
        if (!state || typeof window.showSlashDatePicker !== 'function') return;
        const btn = el('taskDueDateBtn');
        window.showSlashDatePicker(btn ? btn.getBoundingClientRect() : null, function (date) {
            state.day = date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
            syncUi();
        }, null, {
            initialDate: state.day || null
        });
    }

    function openTimePicker() {
        if (!state || typeof window.showSlashDatePicker !== 'function') return;
        const modal = modalEl();
        const btn = el('taskDueTimeBtn');
        window.showSlashDatePicker(btn ? btn.getBoundingClientRect() : null, function (date, time) {
            state.time = time || '';
            // Picking a time without a date implies today
            if (state.time && !state.day) {
                const now = new Date();
                state.day = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
            }
            syncUi();
        }, null, {
            timeOnly: true,
            initialTime: state.time,
            removeTimeLabel: (modal && modal.dataset.txtRemoveTime) || 'Remove time'
        });
    }

    function attachHandlers(modal) {
        if (modal.dataset.handlersAttached === 'true') return;

        const dateBtn = el('taskDueDateBtn');
        if (dateBtn) dateBtn.addEventListener('click', openDatePicker);

        const timeBtn = el('taskDueTimeBtn');
        if (timeBtn) timeBtn.addEventListener('click', openTimePicker);

        const remindInput = el('taskDueRemindInput');
        if (remindInput) {
            remindInput.addEventListener('change', function () {
                if (state) {
                    state.remind = remindInput.checked;
                    syncUi();
                }
            });
        }

        const emailInput = el('taskDueEmailInput');
        if (emailInput) {
            emailInput.addEventListener('change', function () {
                if (state) state.email = emailInput.checked;
            });
        }

        const saveBtn = el('taskDueSaveBtn');
        if (saveBtn) saveBtn.addEventListener('click', handleSave);

        const removeBtn = el('taskDueRemoveBtn');
        if (removeBtn) removeBtn.addEventListener('click', handleRemove);

        modal.dataset.handlersAttached = 'true';
    }

    /**
     * Open the due-date modal for one task.
     *
     * opts: {
     *   noteId, taskId,
     *   task: { text, dueAt, dueReminder, dueReminderEmail },
     *   onSave(payload) -> optional Promise, payload = { dueAt, dueReminder, dueReminderEmail }
     * }
     */
    window.openTaskDueModal = function (opts) {
        const modal = modalEl();
        if (!modal || !opts || !opts.task) return;

        const due = normalizeDue(opts.task.dueAt);
        state = {
            noteId: opts.noteId,
            taskId: opts.taskId !== undefined ? opts.taskId : opts.task.id,
            taskText: opts.task.text || '',
            day: due ? due.substring(0, 10) : '',
            time: (due && due.length > 10) ? due.substring(11, 16) : '',
            remind: !!opts.task.dueReminder,
            email: opts.task.dueReminderEmail !== undefined ? !!opts.task.dueReminderEmail : true,
            hadDue: !!due,
            onSave: opts.onSave
        };

        attachHandlers(modal);
        syncUi();
        modal.style.display = 'flex';
    };

    window.closeTaskDueModal = closeTaskDueModal;
})();
