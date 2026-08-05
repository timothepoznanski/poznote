/**
 * Reminders system for Poznote
 * Handles setting reminders on notes (notifications are displayed on dashboard.php)
 */

// ============================================================================
// STATE
// ============================================================================

let reminderNoteId = null;
let reminderInitialInputValue = '';
let reminderInitialDisplayText = '';
let reminderHasInitialReminder = false;
let reminderInitialEmailEnabled = false;
let reminderEmailAvailable = false;
let reminderInitialRecurrence = '';
const REMINDER_NOTIFICATION_POLL_INTERVAL = 45000;

function parseReminderDate(value) {
    if (!value) return null;

    const trimmedValue = String(value).trim();
    if (!trimmedValue) return null;

    let normalizedValue = trimmedValue;

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmedValue)) {
        normalizedValue = trimmedValue.replace(' ', 'T') + 'Z';
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmedValue)) {
        normalizedValue = trimmedValue.replace(' ', 'T') + ':00Z';
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(?:\.\d{1,3})?)?$/.test(trimmedValue)) {
        normalizedValue = trimmedValue + 'Z';
    }

    const parsedDate = new Date(normalizedValue);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function toLocalDateTimeInputValue(date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
}

function formatReminderDateTime(date) {
    if (typeof window.poznoteFormatDateTime === 'function') {
        return window.poznoteFormatDateTime(date);
    }
    return date.toLocaleString();
}

function showReminderEmptyPreview(currentInfo, currentDate) {
    currentDate.textContent = window.t?.('reminder.modal.no_date_configured') || 'No date configured';
    currentInfo.classList.add('is-empty');
    currentInfo.classList.remove('initially-hidden');
}

function restoreInitialReminderPreview(currentInfo, currentDate) {
    if (reminderHasInitialReminder && reminderInitialDisplayText) {
        currentDate.textContent = reminderInitialDisplayText;
        currentInfo.classList.remove('is-empty');
        currentInfo.classList.remove('initially-hidden');
        return;
    }

    showReminderEmptyPreview(currentInfo, currentDate);
}

function getReminderEmailControls() {
    const modal = document.getElementById('reminderModal');
    const option = document.getElementById('reminderEmailOption');
    const input = document.getElementById('reminderEmailInput');
    const available = modal && modal.dataset.reminderEmailAvailable === '1';
    return { modal, option, input, available };
}

function setReminderEmailOption(enabled) {
    const controls = getReminderEmailControls();
    reminderEmailAvailable = !!controls.available;

    if (controls.option) {
        controls.option.classList.toggle('initially-hidden', !reminderEmailAvailable);
    }

    if (controls.input) {
        controls.input.checked = reminderEmailAvailable && !!enabled;
        controls.input.disabled = !reminderEmailAvailable;
    }
}

function getReminderEmailEnabled() {
    const controls = getReminderEmailControls();
    return !!controls.available && !!controls.input && controls.input.checked;
}

function syncReminderRepeatCustomVisibility() {
    const select = document.getElementById('reminderRepeatSelect');
    const customRow = document.getElementById('reminderRepeatCustom');
    const hint = document.getElementById('reminderRepeatHint');
    if (!select || !customRow) return;
    customRow.classList.toggle('initially-hidden', select.value !== 'custom');
    if (hint) hint.classList.toggle('initially-hidden', select.value === '');
}

function getReminderRecurrenceValue() {
    const select = document.getElementById('reminderRepeatSelect');
    if (!select) return '';
    if (select.value !== 'custom') return select.value;

    const interval = parseInt(document.getElementById('reminderRepeatInterval')?.value, 10);
    const unit = document.getElementById('reminderRepeatUnit')?.value || 'd';
    if (!interval || interval < 1) return '';
    return Math.min(interval, 999) + unit;
}

function setReminderRecurrenceValue(recurrence) {
    const select = document.getElementById('reminderRepeatSelect');
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
        const intervalInput = document.getElementById('reminderRepeatInterval');
        const unitSelect = document.getElementById('reminderRepeatUnit');
        if (intervalInput) intervalInput.value = match[1];
        if (unitSelect) unitSelect.value = match[2];
    }

    syncReminderRepeatCustomVisibility();
}

function updateNotificationIndicators(count) {
    const hasUnreadNotifications = count > 0;
    document.querySelectorAll('.sidebar-home').forEach(function(button) {
        button.classList.toggle('has-notifications-dot', hasUnreadNotifications);
    });
}

function pollNotificationIndicators() {
    if (!document.querySelector('.sidebar-home')) {
        return;
    }

    var workspace = document.body ? document.body.getAttribute('data-workspace') || '' : '';
    var url = '/api/v1/reminders/count' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
    fetch(url, {
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            updateNotificationIndicators(data.unread_count || 0);
        }
    })
    .catch(function() {});
}

// ============================================================================
// REMINDER MODAL
// ============================================================================

function closeReminderPicker() {
    const dateInput = document.getElementById('reminderDateInput');
    if (dateInput && typeof dateInput.blur === 'function') {
        dateInput.blur();
    }

    const activeElement = document.activeElement;
    if (
        activeElement &&
        activeElement !== document.body &&
        activeElement !== document.documentElement &&
        typeof activeElement.blur === 'function'
    ) {
        activeElement.blur();
    }
}

function syncReminderPreviewFromInput() {
    const dateInput = document.getElementById('reminderDateInput');
    const currentInfo = document.getElementById('reminderCurrentInfo');
    const currentDate = document.getElementById('reminderCurrentDate');
    const saveBtn = document.getElementById('reminderSaveBtn');

    if (typeof updateReminderPartButtons === 'function') {
        updateReminderPartButtons();
    }

    if (!dateInput || !currentInfo || !currentDate || !saveBtn) {
        return false;
    }

    const hasDateChanged = dateInput.value !== reminderInitialInputValue;
    const hasEmailChanged = reminderEmailAvailable && getReminderEmailEnabled() !== reminderInitialEmailEnabled;
    const hasRecurrenceChanged = getReminderRecurrenceValue() !== reminderInitialRecurrence;
    const canSave = (hasDateChanged || hasEmailChanged || hasRecurrenceChanged) && !!dateInput.value;
    saveBtn.classList.toggle('initially-hidden', !canSave);

    if (!hasDateChanged || !dateInput.value) {
        restoreInitialReminderPreview(currentInfo, currentDate);
        return canSave;
    }

    const selectedDate = new Date(dateInput.value);
    if (Number.isNaN(selectedDate.getTime())) {
        restoreInitialReminderPreview(currentInfo, currentDate);
        return false;
    }

    currentDate.textContent = formatReminderDateTime(selectedDate);
    currentInfo.classList.remove('is-empty');
    currentInfo.classList.remove('initially-hidden');
    return canSave;
}

/**
 * Open the reminder modal for a note
 */
function openReminderModal(noteId, currentReminderAt) {
    reminderNoteId = noteId;
    const modal = document.getElementById('reminderModal');
    const dateInput = document.getElementById('reminderDateInput');
    const removeBtn = document.getElementById('reminderRemoveBtn');
    const currentInfo = document.getElementById('reminderCurrentInfo');
    const currentDate = document.getElementById('reminderCurrentDate');

    if (!modal || !dateInput) return;

    reminderInitialInputValue = '';
    reminderInitialDisplayText = '';
    reminderHasInitialReminder = false;
    reminderEmailAvailable = getReminderEmailControls().available;
    reminderInitialEmailEnabled = reminderEmailAvailable;
    setReminderEmailOption(reminderInitialEmailEnabled);
    reminderInitialRecurrence = '';
    setReminderRecurrenceValue('');

    // Set minimum date to now
    const now = new Date();
    const localIso = toLocalDateTimeInputValue(now);
    dateInput.min = localIso;
    dateInput.value = '';

    // Show current reminder if exists
    if (currentReminderAt) {
        const reminderDate = parseReminderDate(currentReminderAt);
        reminderInitialDisplayText = reminderDate ? formatReminderDateTime(reminderDate) : currentReminderAt;
        reminderHasInitialReminder = true;
        currentDate.textContent = reminderInitialDisplayText;
        currentInfo.classList.remove('initially-hidden');
        removeBtn.classList.remove('initially-hidden');

        // Pre-fill with current reminder
        if (reminderDate) {
            reminderInitialInputValue = toLocalDateTimeInputValue(reminderDate);
            dateInput.value = reminderInitialInputValue;
        }
    } else {
        showReminderEmptyPreview(currentInfo, currentDate);
        removeBtn.classList.add('initially-hidden');
    }

    syncReminderPreviewFromInput();
    modal.style.display = 'flex';

    if (noteId && currentReminderAt) {
        fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/reminder', {
            headers: { 'Accept': 'application/json' },
            credentials: 'same-origin'
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (!data.success || String(reminderNoteId) !== String(noteId)) {
                return;
            }

            reminderInitialEmailEnabled = reminderEmailAvailable && !!data.email_enabled;
            setReminderEmailOption(reminderInitialEmailEnabled);
            reminderInitialRecurrence = data.recurrence || '';
            setReminderRecurrenceValue(reminderInitialRecurrence);
            syncReminderPreviewFromInput();
        })
        .catch(function() {});
    }
}

/**
 * Close the reminder modal
 */
function closeReminderModal() {
    const modal = document.getElementById('reminderModal');
    closeReminderPicker();
    if (modal) modal.style.display = 'none';
    reminderNoteId = null;
    reminderInitialInputValue = '';
    reminderInitialDisplayText = '';
    reminderHasInitialReminder = false;
    reminderInitialEmailEnabled = false;
    reminderEmailAvailable = false;
    reminderInitialRecurrence = '';
}

/**
 * Save a reminder via API
 */
function saveReminder() {
    if (!reminderNoteId) return;

    const noteId = reminderNoteId;

    const dateInput = document.getElementById('reminderDateInput');
    const emailEnabled = getReminderEmailEnabled();
    const emailChanged = reminderEmailAvailable && emailEnabled !== reminderInitialEmailEnabled;
    const recurrence = getReminderRecurrenceValue();
    const recurrenceChanged = recurrence !== reminderInitialRecurrence;
    if (!dateInput || (dateInput.value === reminderInitialInputValue && !emailChanged && !recurrenceChanged)) {
        return;
    }

    if (!dateInput || !dateInput.value) {
        if (typeof showNotification === 'function') {
            showNotification(window.t?.('reminder.modal.select_date') || 'Please select a date and time', 'warning');
        }
        return;
    }

    const localDate = new Date(dateInput.value);
    const now = new Date();

    if (localDate <= now) {
        if (typeof showNotification === 'function') {
            showNotification(window.t?.('reminder.modal.past_time') || 'Please select a future time', 'warning');
        }
        return;
    }

    // Convert to UTC ISO string
    const utcIso = localDate.toISOString();

    fetch('/api/v1/notes/' + reminderNoteId + '/reminder', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({
            reminder_at: utcIso,
            email_enabled: emailEnabled,
            recurrence: recurrence || null
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            updateReminderButton(noteId, data.reminder_at || utcIso);
            closeReminderModal();
            if (typeof showNotification === 'function') {
                showNotification(
                    (window.t?.('reminder.set_success') || 'Reminder set for') + ' ' + formatReminderDateTime(localDate),
                    'success'
                );
            }
        } else {
            if (typeof showNotification === 'function') {
                showNotification(data.error || 'Failed to set reminder', 'error');
            }
        }
    })
    .catch(e => {
        console.error('Reminder API error:', e);
        if (typeof showNotification === 'function') {
            showNotification('Failed to set reminder', 'error');
        }
    });
}

/**
 * Remove a reminder via API
 */
function removeReminder() {
    if (!reminderNoteId) return;

    const noteId = reminderNoteId;

    fetch('/api/v1/notes/' + reminderNoteId + '/reminder', {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin'
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            updateReminderButton(noteId, null);
            closeReminderModal();
            if (typeof showNotification === 'function') {
                showNotification(
                    window.t?.('reminder.removed') || 'Reminder removed',
                    'success'
                );
            }
        }
    })
    .catch(e => console.error('Remove reminder error:', e));
}

/**
 * Update the reminder button state in the toolbar
 */
function updateReminderButton(noteId, reminderAt) {
    const btn = document.querySelector('.btn-reminder[data-note-id="' + noteId + '"]');
    if (!btn) return;

    if (reminderAt) {
        btn.classList.add('has-reminder');
        btn.dataset.reminderAt = reminderAt;
    } else {
        btn.classList.remove('has-reminder');
        btn.dataset.reminderAt = '';
    }
}

// ============================================================================
// EVENT HANDLERS (Reminder modal only - notifications are on dashboard.php)
// ============================================================================

document.addEventListener('click', function(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;

    switch (action) {
        case 'open-reminder-modal': {
            const btn = e.target.closest('[data-action]');
            const noteId = btn?.dataset.noteId;
            const reminderAt = btn?.dataset.reminderAt || '';
            if (noteId) openReminderModal(noteId, reminderAt || null);
            break;
        }
        case 'close-reminder-modal':
            closeReminderModal();
            break;
        case 'save-reminder':
            saveReminder();
            break;
        case 'remove-reminder':
            removeReminder();
            break;
    }
});

// Close reminder modal on Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeReminderModal();
    }
});

const reminderDateInput = document.getElementById('reminderDateInput');
if (reminderDateInput) {
    reminderDateInput.addEventListener('input', function() {
        syncReminderPreviewFromInput();
    });

    reminderDateInput.addEventListener('change', function() {
        syncReminderPreviewFromInput();
        closeReminderPicker();
    });
}

// Replace the native datetime-local input with two triggers driven by the
// shared calendar popup: the date part opens the calendar alone (a day click
// applies it), the time part opens the hour-then-minutes menu directly.
function getReminderDateTimeParts() {
    const input = document.getElementById('reminderDateInput');
    if (input && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.value || '')) {
        return { day: input.value.substring(0, 10), time: input.value.substring(11, 16) };
    }
    return { day: '', time: '' };
}

function setReminderDateTimeParts(day, time) {
    const input = document.getElementById('reminderDateInput');
    if (!input) return;
    input.value = day + 'T' + time;
    syncReminderPreviewFromInput();
}

function updateReminderPartButtons() {
    const dateLabel = document.getElementById('reminderDateBtnLabel');
    const timeLabel = document.getElementById('reminderTimeBtnLabel');
    if (!dateLabel || !timeLabel) return;

    const parts = getReminderDateTimeParts();

    if (parts.day) {
        const d = new Date(
            parseInt(parts.day.substring(0, 4), 10),
            parseInt(parts.day.substring(5, 7), 10) - 1,
            parseInt(parts.day.substring(8, 10), 10)
        );
        dateLabel.textContent = (typeof window.poznoteFormatDateOnly === 'function')
            ? window.poznoteFormatDateOnly(d)
            : d.toLocaleDateString();
    } else {
        dateLabel.textContent = window.t?.('reminder.modal.date_placeholder') || 'Date';
    }

    if (parts.time) {
        const t = new Date(2000, 0, 1,
            parseInt(parts.time.substring(0, 2), 10),
            parseInt(parts.time.substring(3, 5), 10));
        timeLabel.textContent = (typeof window.poznoteFormatTimeOnly === 'function')
            ? window.poznoteFormatTimeOnly(t)
            : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        timeLabel.textContent = window.t?.('reminder.modal.time_placeholder') || 'Time';
    }
}

function reminderLocalTodayString() {
    const now = new Date();
    return now.getFullYear() + '-'
        + String(now.getMonth() + 1).padStart(2, '0') + '-'
        + String(now.getDate()).padStart(2, '0');
}

function openReminderDateOnlyPicker() {
    const btn = document.getElementById('reminderDateBtn');
    if (!btn || typeof window.showSlashDatePicker !== 'function') return;

    const parts = getReminderDateTimeParts();
    window.showSlashDatePicker(btn.getBoundingClientRect(), function(date) {
        const day = date.getFullYear() + '-'
            + String(date.getMonth() + 1).padStart(2, '0') + '-'
            + String(date.getDate()).padStart(2, '0');
        // A reminder needs a trigger time; default to 09:00 until one is set
        setReminderDateTimeParts(day, parts.time || '09:00');
    }, null, {
        initialDate: parts.day || null
    });
}

function openReminderTimeOnlyPicker() {
    const btn = document.getElementById('reminderTimeBtn');
    if (!btn || typeof window.showSlashDatePicker !== 'function') return;

    const parts = getReminderDateTimeParts();
    window.showSlashDatePicker(btn.getBoundingClientRect(), function(_, time) {
        setReminderDateTimeParts(parts.day || reminderLocalTodayString(), time);
    }, null, {
        timeOnly: true,
        initialTime: parts.time
    });
}

if (reminderDateInput && typeof window.showSlashDatePicker === 'function') {
    const reminderDateBtn = document.getElementById('reminderDateBtn');
    const reminderTimeBtn = document.getElementById('reminderTimeBtn');

    if (reminderDateBtn && reminderTimeBtn) {
        reminderDateInput.classList.add('initially-hidden');
        reminderDateBtn.classList.remove('initially-hidden');
        reminderTimeBtn.classList.remove('initially-hidden');

        reminderDateBtn.addEventListener('click', openReminderDateOnlyPicker);
        reminderTimeBtn.addEventListener('click', openReminderTimeOnlyPicker);
    }
}

const reminderEmailInput = document.getElementById('reminderEmailInput');
if (reminderEmailInput) {
    reminderEmailInput.addEventListener('change', function() {
        syncReminderPreviewFromInput();
    });
}

const reminderRepeatSelect = document.getElementById('reminderRepeatSelect');
if (reminderRepeatSelect) {
    reminderRepeatSelect.addEventListener('change', function() {
        syncReminderRepeatCustomVisibility();
        syncReminderPreviewFromInput();
    });
}

['reminderRepeatInterval', 'reminderRepeatUnit'].forEach(function(id) {
    const control = document.getElementById(id);
    if (control) {
        control.addEventListener('input', function() {
            syncReminderPreviewFromInput();
        });
        control.addEventListener('change', function() {
            syncReminderPreviewFromInput();
        });
    }
});

pollNotificationIndicators();
setInterval(pollNotificationIndicators, REMINDER_NOTIFICATION_POLL_INTERVAL);
