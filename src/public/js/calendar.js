/**
 * Mini Calendar Component for Poznote
 * Displays a calendar at the bottom of the left sidebar, with the number of notes created
 * and the number of notes last modified under each day
 */

class MiniCalendar {
    constructor() {
        this.currentDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        // Notes per YYYY-MM-DD, by creation and by last modification date
        this.countsByMode = { created: {}, modified: {} };
        this.fetchGeneration = 0;
        this.translations = window.calendarTranslations || this.getDefaultTranslations();
        // Default to hidden until the user explicitly toggles it.
        const storedVisibility = localStorage.getItem('calendarVisible');
        this.isVisible = storedVisibility === null ? false : storedVisibility === 'true';
        // Which notes the day modal lists: 'created' or 'modified'.
        this.mode = localStorage.getItem('calendarMode') === 'modified' ? 'modified' : 'created';
        this.init();
    }

    getDefaultTranslations() {
        return {
            months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            weekdays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
            previousMonth: 'Previous month',
            nextMonth: 'Next month',
            today: 'Today',
            modes: {
                created: 'Created',
                modified: 'Modified'
            },
            dayCounts: 'Created: {{created}} / Modified: {{modified}}',
            modal: {
                title: 'Notes from',
                open_all: 'Open All',
                close: 'Close',
                no_notes: 'No notes on this day.',
                diary_open: 'Open diary entry',
                diary_create: 'Create diary entry',
                diary_error: 'Could not create the diary entry.'
            }
        };
    }

    init() {
        this.fetchNotesData();
        this.render();
        this.attachEventListeners();
    }

    /**
     * Get the active workspace for calendar API calls.
     */
    getCurrentWorkspace() {
        try {
            const urlParams = new URLSearchParams(window.location.search || '');
            const workspaceFromUrl = urlParams.get('workspace');
            if (workspaceFromUrl) {
                return workspaceFromUrl;
            }
        } catch (error) {
            // Ignore URL parsing errors and continue with page state fallbacks.
            console.debug('calendar: failed:', error);
        }

        if (typeof getSelectedWorkspace === 'function') {
            const selected = getSelectedWorkspace();
            if (selected) {
                return selected;
            }
        }

        if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) {
            return selectedWorkspace;
        }

        if (window.selectedWorkspace) {
            return window.selectedWorkspace;
        }

        const configElement = document.getElementById('page-config-data');
        if (configElement) {
            try {
                const config = JSON.parse(configElement.textContent || '{}');
                if (config.selectedWorkspace) {
                    return config.selectedWorkspace;
                }
            } catch (error) {
                // Ignore malformed config and continue with DOM fallback.
                console.debug('calendar: failed:', error);
            }
        }

        return document.body ? document.body.getAttribute('data-workspace') || '' : '';
    }

    /**
     * Build a calendar API URL scoped to the active workspace.
     */
    buildCalendarApiUrl(endpoint, params = {}) {
        const searchParams = new URLSearchParams(params);
        const workspace = this.getCurrentWorkspace();

        if (workspace) {
            searchParams.set('workspace', workspace);
        }

        const queryString = searchParams.toString();
        return queryString ? `${endpoint}?${queryString}` : endpoint;
    }

    /**
     * Fetch notes data from the database
     * Groups notes by creation date and by last modification date
     */
    async fetchNotesData() {
        const generation = ++this.fetchGeneration;
        try {
            const [created, modified] = await Promise.all(['created', 'modified'].map(async mode => {
                const response = await fetch(this.buildCalendarApiUrl('api/v1/calendar/notes-by-date.php', { mode }));
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            }));
            // A refresh started while this one was in flight wins
            if (generation !== this.fetchGeneration) return;
            this.countsByMode = { created: created || {}, modified: modified || {} };
            this.render();
        } catch (error) {
            console.error('Error fetching calendar data:', error);
        }
    }

    /**
     * Switch the day modal list between created and last modified notes
     */
    setMode(mode) {
        const next = mode === 'modified' ? 'modified' : 'created';
        if (next === this.mode) return;
        this.mode = next;
        localStorage.setItem('calendarMode', next);
    }

    /**
     * Refresh calendar data (useful when switching workspaces)
     */
    refresh() {
        this.fetchNotesData();
    }

    /**
     * Get the number of notes created and last modified on a specific date
     */
    getDayCounts(year, month, day) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return {
            created: Number(this.countsByMode.created[dateKey]) || 0,
            modified: Number(this.countsByMode.modified[dateKey]) || 0
        };
    }

    /**
     * Get the number of days in a month
     */
    getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    /**
     * Get the first day of the month (0 = Sunday, 1 = Monday, etc.)
     */
    getFirstDayOfMonth(year, month) {
        return new Date(year, month, 1).getDay();
    }

    /**
     * Get month name
     */
    getMonthName(month) {
        return this.translations.months[month];
    }

    /**
     * Get the active locale from the document language.
     */
    getCurrentLocale() {
        return document.documentElement.lang || navigator.language || 'en';
    }

    /**
     * Format a YYYY-MM-DD date string using the active locale.
     */
    formatDateForModal(dateStr) {
        const dateParts = dateStr.split('-').map(Number);
        if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) {
            return dateStr;
        }

        const [year, month, day] = dateParts;
        const date = new Date(year, month - 1, day);

        return new Intl.DateTimeFormat(this.getCurrentLocale(), {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(date);
    }

    /**
     * Navigate to previous month
     */
    previousMonth() {
        this.currentMonth--;
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        }
        this.render();
    }

    /**
     * Navigate to next month
     */
    nextMonth() {
        this.currentMonth++;
        if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        this.render();
    }

    /**
     * Go back to current month
     */
    goToToday() {
        const today = new Date();
        this.currentMonth = today.getMonth();
        this.currentYear = today.getFullYear();
        this.render();
    }

    /**
     * Toggle calendar visibility
     */
    toggleVisibility() {
        this.isVisible = !this.isVisible;
        localStorage.setItem('calendarVisible', this.isVisible);
        this.render();
    }

    /**
     * Render the calendar
     */
    render() {
        const container = document.getElementById('mini-calendar');
        if (!container) return;

        const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);
        const firstDay = this.getFirstDayOfMonth(this.currentYear, this.currentMonth);
        const today = new Date();
        const isCurrentMonth = this.currentMonth === today.getMonth() && this.currentYear === today.getFullYear();

        // Adjust firstDay to start on Monday (0 = Monday, 6 = Sunday)
        const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;

        let html = '';

        if (!this.isVisible) {
            // When hidden, show only the toggle button
            html = `
                <div class="mini-calendar-header mini-calendar-collapsed">
                    <button class="mini-calendar-toggle" data-action="toggle" title="${this.translations.showCalendar || 'Show calendar'}">
                        <i class="lucide lucide-calendar"></i>
                    </button>
                </div>
            `;
        } else {
            const dayCounts = this.translations.dayCounts || this.getDefaultTranslations().dayCounts;

            html = `
                <div class="mini-calendar-header">
                    <div class="mini-calendar-month-year">
                        ${this.getMonthName(this.currentMonth)} <span class="mini-calendar-year">${this.currentYear}</span>
                    </div>
                    <button class="mini-calendar-nav" data-action="prev-month" title="${this.translations.previousMonth}">
                        <i class="lucide lucide-chevron-left"></i>
                    </button>
                    <button class="mini-calendar-today" data-action="today" title="${this.translations.today}">
                        <i class="lucide lucide-calendar"></i>
                    </button>
                    <button class="mini-calendar-nav" data-action="next-month" title="${this.translations.nextMonth}">
                        <i class="lucide lucide-chevron-right"></i>
                    </button>
                    <button class="mini-calendar-toggle" data-action="toggle" title="${this.translations.hideCalendar || 'Hide calendar'}">
                        <i class="lucide lucide-chevron-down"></i>
                    </button>
                </div>
                <div class="mini-calendar-content">
                    <div class="mini-calendar-weekdays">
                        ${this.translations.weekdays.map(day => `<div class="mini-calendar-weekday">${day}</div>`).join('')}
                    </div>
                    <div class="mini-calendar-days">
            `;

            // Add empty cells for days before the first day of the month
            for (let i = 0; i < adjustedFirstDay; i++) {
                html += '<div class="mini-calendar-day mini-calendar-day-empty"></div>';
            }

            // Add days of the month
            for (let day = 1; day <= daysInMonth; day++) {
                const counts = this.getDayCounts(this.currentYear, this.currentMonth, day);
                const hasNotes = counts.created > 0 || counts.modified > 0;
                const isToday = isCurrentMonth && day === today.getDate();
                const todayClass = isToday ? ' mini-calendar-day-today' : '';
                const hasNotesClass = hasNotes ? ' mini-calendar-day-has-notes' : '';
                // created/modified, the tooltip naming which is which
                const title = hasNotes
                    ? ` title="${this.escapeHtml(dayCounts.split('{{created}}').join(counts.created).split('{{modified}}').join(counts.modified))}"`
                    : '';
                const countsHtml = hasNotes
                    ? `<span class="mini-calendar-count-created">${counts.created}</span><span class="mini-calendar-count-sep">/</span><span class="mini-calendar-count-modified">${counts.modified}</span>`
                    : '';

                html += `
                    <div class="mini-calendar-day${todayClass}${hasNotesClass}" data-day="${day}"${title}>
                        <span class="mini-calendar-day-number">${day}</span>
                        <span class="mini-calendar-day-count">${countsHtml}</span>
                    </div>
                `;
            }

            html += '</div></div>';
        }

        container.innerHTML = html;
    }

    /**
     * Render the Created / Modified switch shown in the day modal, each
     * option with its number of notes (`counts` = { created, modified })
     */
    renderModeSwitch(counts) {
        const modes = this.translations.modes || {};
        return `
            <div class="calendar-mode-switch" role="group">
                ${['created', 'modified'].map(mode => `
                    <button type="button" class="calendar-mode-option${mode === this.mode ? ' active' : ''}" data-mode="${mode}" aria-pressed="${mode === this.mode}">
                        ${this.escapeHtml(modes[mode] || (mode === 'modified' ? 'Modified' : 'Created'))}
                        <span class="calendar-mode-count">${counts[mode]}</span>
                    </button>
                `).join('')}
            </div>
        `;
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        const container = document.getElementById('mini-calendar');
        if (!container) return;

        container.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.getAttribute('data-action');

            switch (action) {
                case 'prev-month':
                    this.previousMonth();
                    break;
                case 'next-month':
                    this.nextMonth();
                    break;
                case 'today':
                    this.goToToday();
                    break;
                case 'toggle':
                    this.toggleVisibility();
                    break;
            }
        });

        // Click on day to show that day's notes (and diary entry action).
        // Days without notes open the popup too, so a diary entry can be
        // created for any past date.
        container.addEventListener('click', (e) => {
            const dayElement = e.target.closest('.mini-calendar-day:not(.mini-calendar-day-empty)');
            if (!dayElement) return;

            const day = dayElement.getAttribute('data-day');
            const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            this.filterNotesByDate(dateStr);
        });
    }

    /**
     * Fetch the notes created (or last modified, per the current mode) on a date.
     * Returns null when the request fails.
     */
    async fetchNotesOnDate(dateStr) {
        const response = await fetch(this.buildCalendarApiUrl('api/v1/calendar/notes-on-date.php', { date: dateStr, mode: this.mode }));
        if (!response.ok) {
            console.error('Failed to fetch notes for date:', dateStr);
            return null;
        }
        return response.json();
    }

    /**
     * Show modal with notes from a specific date
     */
    async filterNotesByDate(dateStr) {
        try {
            // Fetch the day's notes and its diary entry status in parallel
            const [notes, diaryResponse] = await Promise.all([
                this.fetchNotesOnDate(dateStr),
                fetch(this.buildCalendarApiUrl('api/v1/calendar/diary-entry.php', { date: dateStr }))
            ]);

            if (!notes) return;

            const diary = diaryResponse.ok ? await diaryResponse.json() : null;

            // Show modal with notes list and diary entry action
            this.showNotesModal(notes || [], dateStr, diary);

        } catch (error) {
            console.error('Error opening notes for date:', error);
        }
    }

    /**
     * Open a note in a new internal tab (fallback: full page load)
     */
    openNoteInTab(noteId, noteTitle) {
        if (window.tabManager) {
            window.tabManager.openInNewTab(noteId, noteTitle || 'Untitled');
        } else {
            window.location.href = `index.php?note=${noteId}`;
        }
    }

    /**
     * Open the diary entry for a date, creating it first when needed.
     * `diary` is the api/v1/calendar/diary-entry.php payload for that date.
     */
    async openOrCreateDiaryEntry(diary, dateStr, button) {
        if (diary.exists && diary.id) {
            this.openNoteInTab(diary.id, dateStr);
            return true;
        }

        button.disabled = true;
        try {
            const response = await fetch('api/v1/notes', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({
                    // The title follows the configured diary date format;
                    // created_date stays YYYY-MM-DD, as the API expects.
                    heading: diary.title || dateStr,
                    folder_name: diary.folder,
                    workspace: diary.workspace,
                    type: diary.noteType === 'markdown' ? 'markdown' : 'note',
                    created_date: dateStr
                })
            });
            const result = await response.json();
            if (result.success && result.note) {
                this.openNoteInTab(result.note.id, dateStr);
                // Refresh the folder tree (and thereby the calendar dots) so
                // the new entry shows up without a manual reload. The sidebar
                // refresh rebuilds the mini calendar with fresh data.
                if (typeof refreshNotesListAfterFolderAction === 'function') {
                    refreshNotesListAfterFolderAction(result.note.folder_id);
                } else {
                    this.refresh();
                }
                return true;
            }
            throw new Error(result.error || result.message || '');
        } catch (error) {
            button.disabled = false;
            const message = this.translations.modal.diary_error || 'Could not create the diary entry.';
            if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
                window.modalAlert.alert(message, 'error');
            } else {
                window.alert(message);
            }
            return false;
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Render the notes list of the day modal
     */
    renderNotesListHtml(notes) {
        return notes.length > 0
            ? notes.map(note => `
                <button type="button" class="calendar-note-item" data-note-id="${note.id}" data-note-title="${this.escapeHtml(note.title || 'Untitled')}">
                    <span class="calendar-note-title">${this.escapeHtml(note.title || 'Untitled')}</span>
                </button>
            `).join('')
            : `<div class="calendar-notes-empty">${this.translations.modal.no_notes || 'No notes on this day.'}</div>`;
    }

    /**
     * Show modal with list of notes from a specific date
     */
    showNotesModal(notes, dateStr, diary) {
        const formattedDate = this.formatDateForModal(dateStr);
        // Replaced when the Created / Modified switch reloads the list
        let currentNotes = notes;
        // Notes per mode on this day: the calendar's figures, the shown list
        // being the fresher source for its own mode
        const [year, month, day] = dateStr.split('-').map(Number);
        const dayCounts = this.getDayCounts(year, month - 1, day);
        dayCounts[this.mode] = notes.length;

        // One button per diary when the workspace has several; the payload of
        // each is normalized to the shape openOrCreateDiaryEntry expects.
        const diaryTargets = diary
            ? (Array.isArray(diary.diaries) && diary.diaries.length > 1
                ? diary.diaries.map(d => ({
                    exists: d.exists,
                    id: d.noteId,
                    folder: d.folder,
                    workspace: d.workspace,
                    noteType: d.noteType,
                    title: d.title,
                    name: d.name
                }))
                : [diary])
            : [];

        const diaryBtnHtml = diaryTargets.map((target, index) => {
            const label = target.exists
                ? (this.translations.modal.diary_open || 'Open diary entry')
                : (this.translations.modal.diary_create || 'Create diary entry');
            const suffix = diaryTargets.length > 1 ? ` (${this.escapeHtml(target.name || '')})` : '';
            return `<button class="btn-open-all calendar-diary-entry-btn" data-action="diary-entry" data-diary-index="${index}">
                    ${label}${suffix}
               </button>`;
        }).join('');

        // Create modal HTML
        const modalHtml = `
            <div class="modal-overlay calendar-notes-modal-overlay">
                <div class="modal-dialog calendar-notes-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">${this.translations.modal.title} ${formattedDate}</h3>
                        ${this.renderModeSwitch(dayCounts)}
                    </div>
                    <div class="modal-body">
                        <div class="calendar-notes-list">
                            ${this.renderNotesListHtml(notes)}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-open-all" data-action="open-all"${notes.length > 0 ? '' : ' hidden'}>${this.translations.modal.open_all}</button>
                        ${diaryBtnHtml}
                        <button class="btn-close" data-action="close-modal">${this.translations.modal.close}</button>
                    </div>
                </div>
            </div>
        `;

        // Insert modal into DOM
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);

        // Add event listeners
        const modal = modalContainer.querySelector('.calendar-notes-modal-overlay');
        const list = modal.querySelector('.calendar-notes-list');
        const openAllBtn = modal.querySelector('[data-action="open-all"]');

        // Close modal on overlay click
        let pressedOnBackdrop = false;
        modal.addEventListener('mousedown', (e) => {
            pressedOnBackdrop = (e.target === modal);
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal && pressedOnBackdrop) {
                modal.remove();
            }
            pressedOnBackdrop = false;
        });

        // Close modal on close button click
        modal.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.remove();
            });
        });

        // Open all notes when clicking "Open All" button
        openAllBtn.addEventListener('click', () => {
            currentNotes.forEach(note => {
                if (window.tabManager) {
                    window.tabManager.openInNewTab(note.id, note.title || 'Untitled');
                }
            });
            // Close modal after opening all notes
            modal.remove();
        });

        // Open (or create) the diary entry for this day
        modal.querySelectorAll('[data-action="diary-entry"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const target = diaryTargets[parseInt(btn.getAttribute('data-diary-index'), 10)] || diary;
                const opened = await this.openOrCreateDiaryEntry(target, dateStr, btn);
                if (opened) modal.remove();
            });
        });

        // Created / Modified: remembers the choice and reloads this day's list
        // in place
        const modeOptions = modal.querySelectorAll('.calendar-mode-option');
        modeOptions.forEach(option => {
            option.addEventListener('click', async () => {
                const mode = option.getAttribute('data-mode');
                if (mode === this.mode) return;
                this.setMode(mode);
                modeOptions.forEach(other => {
                    const active = other.getAttribute('data-mode') === this.mode;
                    other.classList.toggle('active', active);
                    other.setAttribute('aria-pressed', String(active));
                });

                const requested = this.mode;
                const fresh = await this.fetchNotesOnDate(dateStr).catch(() => null);
                if (!fresh || requested !== this.mode || !modal.isConnected) return;
                currentNotes = fresh;
                list.innerHTML = this.renderNotesListHtml(fresh);
                openAllBtn.hidden = fresh.length === 0;
                option.querySelector('.calendar-mode-count').textContent = fresh.length;
            });
        });

        // Open a note in a tab from its row, delegated so the rows the mode
        // switch re-renders keep working
        list.addEventListener('click', (e) => {
            const item = e.target.closest('.calendar-note-item');
            if (!item) return;
            this.openNoteInTab(item.getAttribute('data-note-id'), item.getAttribute('data-note-title'));
        });
    }
}

// Expose MiniCalendar class globally
window.MiniCalendar = MiniCalendar;

// Initialize calendar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.miniCalendar = new MiniCalendar();
});
