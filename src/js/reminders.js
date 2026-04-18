/**
 * Reminders system for Poznote
 * Handles setting reminders on notes (notifications are displayed on home.php)
 */

// ============================================================================
// STATE
// ============================================================================

let reminderNoteId = null;
let reminderInitialInputValue = '';
let reminderInitialDisplayText = '';
let reminderHasInitialReminder = false;
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

function restoreInitialReminderPreview(currentInfo, currentDate) {
    if (reminderHasInitialReminder && reminderInitialDisplayText) {
        currentDate.textContent = reminderInitialDisplayText;
        currentInfo.classList.remove('initially-hidden');
        return;
    }

    currentDate.textContent = '';
    currentInfo.classList.add('initially-hidden');
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

    fetch('/api/v1/reminders/count', {
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

    if (!dateInput || !currentInfo || !currentDate || !saveBtn) {
        return false;
    }

    const hasChanged = dateInput.value !== reminderInitialInputValue;
    const canSave = hasChanged && !!dateInput.value;
    saveBtn.classList.toggle('initially-hidden', !canSave);

    if (!hasChanged || !dateInput.value) {
        restoreInitialReminderPreview(currentInfo, currentDate);
        return canSave;
    }

    const selectedDate = new Date(dateInput.value);
    if (Number.isNaN(selectedDate.getTime())) {
        restoreInitialReminderPreview(currentInfo, currentDate);
        return false;
    }

    currentDate.textContent = selectedDate.toLocaleString();
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

    // Set minimum date to now
    const now = new Date();
    const localIso = toLocalDateTimeInputValue(now);
    dateInput.min = localIso;
    dateInput.value = '';

    // Show current reminder if exists
    if (currentReminderAt) {
        const reminderDate = parseReminderDate(currentReminderAt);
        reminderInitialDisplayText = reminderDate ? reminderDate.toLocaleString() : currentReminderAt;
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
        currentInfo.classList.add('initially-hidden');
        removeBtn.classList.add('initially-hidden');
    }

    syncReminderPreviewFromInput();
    modal.style.display = 'flex';
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
}

/**
 * Save a reminder via API
 */
function saveReminder() {
    if (!reminderNoteId) return;

    const noteId = reminderNoteId;

    const dateInput = document.getElementById('reminderDateInput');
    if (!dateInput || dateInput.value === reminderInitialInputValue) {
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
        body: JSON.stringify({ reminder_at: utcIso })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            updateReminderButton(noteId, data.reminder_at || utcIso);
            closeReminderModal();
            if (typeof showNotification === 'function') {
                showNotification(
                    (window.t?.('reminder.set_success') || 'Reminder set for') + ' ' + localDate.toLocaleString(),
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

/**
 * Handle quick option buttons (30min, 1h, 3h, tomorrow, 1 week)
 */
function handleQuickReminder(e) {
    const btn = e.target.closest('.reminder-quick-btn');
    if (!btn) return;

    const dateInput = document.getElementById('reminderDateInput');
    if (!dateInput) return;

    const now = new Date();
    let target = new Date(now);

    if (btn.dataset.minutes) {
        target.setMinutes(target.getMinutes() + parseInt(btn.dataset.minutes));
    } else if (btn.dataset.hours) {
        target.setHours(target.getHours() + parseInt(btn.dataset.hours));
    } else if (btn.dataset.days) {
        target.setDate(target.getDate() + parseInt(btn.dataset.days));
        // For "tomorrow", set to 9:00 AM
        if (parseInt(btn.dataset.days) === 1) {
            target.setHours(9, 0, 0, 0);
        }
    }

    const localIso = toLocalDateTimeInputValue(target);
    dateInput.value = localIso;
    syncReminderPreviewFromInput();
}

// ============================================================================
// EVENT HANDLERS (Reminder modal only - notifications are on home.php)
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

    // Quick reminder buttons
    if (e.target.closest('.reminder-quick-btn')) {
        handleQuickReminder(e);
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

pollNotificationIndicators();
setInterval(pollNotificationIndicators, REMINDER_NOTIFICATION_POLL_INTERVAL);
