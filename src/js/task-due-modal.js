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

    // On mobile the note toolbar is raised above every overlay while the virtual
    // keyboard is up, and the keyboard itself eats most of the screen. The due
    // date is picked with taps only, so drop the focus that keeps the keyboard
    // open (the "new task" field, the note title) when the modal opens, like the
    // date picker popup does.
    function dismissMobileKeyboard() {
        if (window.innerWidth > 800) return;

        var active = document.activeElement;
        if (!active || active === document.body || typeof active.blur !== 'function') return;
        if (!active.matches || !active.matches('input, textarea, select, [contenteditable="true"]')) return;
        // Never fight the modal's own controls
        if (active.closest && active.closest('#taskDueModal')) return;

        try { active.blur(); } catch (e) { }
    }

    function emailAvailable() {
        const modal = modalEl();
        return !!(modal && modal.dataset.emailAvailable === '1');
    }

    // Recurrence select handling, mirroring the note reminder modal
    // (canonical value: "<count><unit>" with unit i/h/d/w/m/y)
    function getTaskDueRecurrence() {
        const select = el('taskDueRepeatSelect');
        if (!select) return '';
        if (select.value !== 'custom') return select.value;

        const interval = parseInt(el('taskDueRepeatInterval')?.value, 10);
        const unit = el('taskDueRepeatUnit')?.value || 'd';
        if (!interval || interval < 1) return '';
        return Math.min(interval, 999) + unit;
    }

    function setTaskDueRecurrence(recurrence) {
        const select = el('taskDueRepeatSelect');
        if (!select) return;

        const value = String(recurrence || '');
        const match = value.match(/^([1-9]\d{0,2})([ihdwmy])$/);
        const presets = ['1h', '1d', '1w', '1m', '1y'];

        if (!match) {
            select.value = '';
        } else if (presets.indexOf(value) !== -1) {
            select.value = value;
        } else {
            select.value = 'custom';
            const intervalInput = el('taskDueRepeatInterval');
            const unitSelect = el('taskDueRepeatUnit');
            if (intervalInput) intervalInput.value = match[1];
            if (unitSelect) unitSelect.value = match[2];
        }
    }

    // The repeat row stays visible like in the note reminder modal; only the
    // custom interval editor and the dismissal hint follow the selection
    function syncRepeatUi() {
        const select = el('taskDueRepeatSelect');
        const customRow = el('taskDueRepeatCustom');
        const hint = el('taskDueRepeatHint');
        if (customRow) customRow.classList.toggle('initially-hidden', !select || select.value !== 'custom');
        if (hint) hint.classList.toggle('initially-hidden', !select || select.value === '');
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

        syncRepeatUi();

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
                    email_enabled: payload.dueReminderEmail,
                    recurrence: payload.dueRecurrence
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
        const remind = !!(state.remind && dueAt);
        applyAndClose({
            dueAt: dueAt,
            dueReminder: remind,
            dueReminderEmail: !!(state.remind && state.email && emailAvailable()),
            dueRecurrence: (remind && getTaskDueRecurrence()) || null
        });
    }

    function handleRemove() {
        if (!state) return;
        applyAndClose({ dueAt: null, dueReminder: false, dueReminderEmail: false, dueRecurrence: null });
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
                    // The repeat is driven by dismissing the notification, so
                    // it cannot survive without the reminder
                    if (!state.remind) setTaskDueRecurrence('');
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

        const repeatSelect = el('taskDueRepeatSelect');
        if (repeatSelect) {
            repeatSelect.addEventListener('change', function () {
                // A repeating due date advances through its notification, so
                // choosing a repeat implies the reminder
                if (state && repeatSelect.value !== '' && !state.remind) {
                    state.remind = true;
                }
                syncUi();
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
     *   task: { text, dueAt, dueReminder, dueReminderEmail, dueRecurrence },
     *   onSave(payload) -> optional Promise,
     *   payload = { dueAt, dueReminder, dueReminderEmail, dueRecurrence }
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
        setTaskDueRecurrence(opts.task.dueRecurrence);
        syncUi();
        modal.style.display = 'flex';

        // Mobile browsers can move the focus into an editable while handling the
        // tap that opened the modal, so re-check once the tap is fully processed.
        dismissMobileKeyboard();
        requestAnimationFrame(dismissMobileKeyboard);
    };

    window.closeTaskDueModal = closeTaskDueModal;
})();
