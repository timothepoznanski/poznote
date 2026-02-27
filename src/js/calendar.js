/**
 * Mini Calendar Component for Poznote
 * Displays a calendar at the bottom of the left sidebar with dots indicating notes created on each day
 */

class MiniCalendar {
    constructor() {
        this.currentDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        this.notesData = {};
        this.translations = window.calendarTranslations || this.getDefaultTranslations();
        this.init();
    }

    getDefaultTranslations() {
        return {
            months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            weekdays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
            previousMonth: 'Previous month',
            nextMonth: 'Next month',
            today: 'Today'
        };
    }

    init() {
        this.fetchNotesData();
        this.render();
        this.attachEventListeners();
    }

    /**
     * Fetch notes data from the database
     * Groups notes by creation date
     */
    async fetchNotesData() {
        try {
            // Fetch notes data via AJAX
            const response = await fetch('api/v1/calendar/notes-by-date.php');
            if (response.ok) {
                const data = await response.json();
                this.notesData = data;
                this.render();
            }
        } catch (error) {
            console.error('Error fetching calendar data:', error);
        }
    }

    /**
     * Get the number of notes created on a specific date
     */
    getNotesCount(year, month, day) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return this.notesData[dateKey] || 0;
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

        let html = `
            <div class="mini-calendar-header">
                <button class="mini-calendar-nav" data-action="prev-month" title="${this.translations.previousMonth}">
                    <i class="lucide lucide-chevron-left"></i>
                </button>
                <div class="mini-calendar-month-year">
                    ${this.getMonthName(this.currentMonth)} ${this.currentYear}
                </div>
                <button class="mini-calendar-nav" data-action="next-month" title="${this.translations.nextMonth}">
                    <i class="lucide lucide-chevron-right"></i>
                </button>
                <button class="mini-calendar-today" data-action="today" title="${this.translations.today}">
                    <i class="lucide lucide-calendar"></i>
                </button>
            </div>
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
            const notesCount = this.getNotesCount(this.currentYear, this.currentMonth, day);
            const isToday = isCurrentMonth && day === today.getDate();
            const todayClass = isToday ? ' mini-calendar-day-today' : '';
            const hasNotesClass = notesCount > 0 ? ' mini-calendar-day-has-notes' : '';

            html += `
                <div class="mini-calendar-day${todayClass}${hasNotesClass}" data-day="${day}" data-notes-count="${notesCount}">
                    <span class="mini-calendar-day-number">${day}</span>
                    ${this.renderNoteDots(notesCount)}
                </div>
            `;
        }

        html += '</div>';

        container.innerHTML = html;
    }

    /**
     * Render note dots for a day
     * Shows up to 3 dots, with a "+" indicator if there are more
     */
    renderNoteDots(count) {
        if (count === 0) return '';

        const dotsToShow = Math.min(count, 3);
        let dotsHtml = '<div class="mini-calendar-dots">';

        for (let i = 0; i < dotsToShow; i++) {
            dotsHtml += '<span class="mini-calendar-dot"></span>';
        }

        if (count > 3) {
            dotsHtml += '<span class="mini-calendar-dot-more">+</span>';
        }

        dotsHtml += '</div>';
        return dotsHtml;
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
            }
        });

        // Click on day to filter notes by date
        container.addEventListener('click', (e) => {
            const dayElement = e.target.closest('.mini-calendar-day:not(.mini-calendar-day-empty)');
            if (!dayElement) return;

            const day = dayElement.getAttribute('data-day');
            const notesCount = parseInt(dayElement.getAttribute('data-notes-count'), 10);

            if (notesCount > 0) {
                const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                this.filterNotesByDate(dateStr);
            }
        });
    }

    /**
     * Show modal with notes from a specific date
     */
    async filterNotesByDate(dateStr) {
        try {
            // Fetch notes created on this date
            const response = await fetch(`api/v1/calendar/notes-on-date.php?date=${dateStr}`);
            if (!response.ok) {
                console.error('Failed to fetch notes for date:', dateStr);
                return;
            }

            const notes = await response.json();

            if (!notes || notes.length === 0) {
                console.log('No notes found for date:', dateStr);
                return;
            }

            // Show modal with notes list
            this.showNotesModal(notes, dateStr);

        } catch (error) {
            console.error('Error opening notes for date:', error);
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
     * Show modal with list of notes from a specific date
     */
    showNotesModal(notes, dateStr) {
        // Format date for display
        const date = new Date(dateStr);
        const formattedDate = `${this.getMonthName(date.getMonth())} ${date.getDate()}, ${date.getFullYear()}`;

        // Create modal HTML
        const modalHtml = `
            <div class="modal-overlay calendar-notes-modal-overlay">
                <div class="modal-dialog calendar-notes-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">${this.translations.modal.title} ${formattedDate}</h3>
                    </div>
                    <div class="modal-body">
                        <div class="calendar-notes-list">
                            ${notes.map(note => `
                                <div class="calendar-note-item" data-note-id="${note.id}">
                                    <span class="calendar-note-title">${this.escapeHtml(note.title || 'Untitled')}</span>
                                    <button class="calendar-note-open-btn" data-note-id="${note.id}" data-note-title="${this.escapeHtml(note.title || 'Untitled')}">
                                        ${this.translations.modal.open}
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-close-red" data-action="close-modal">${this.translations.modal.close}</button>
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

        // Close modal on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Close modal on close button click
        modal.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.remove();
            });
        });

        // Open note in tab when clicking "Open" button
        modal.querySelectorAll('.calendar-note-open-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = btn.getAttribute('data-note-id');
                const noteTitle = btn.getAttribute('data-note-title');

                if (window.tabManager) {
                    window.tabManager.openInNewTab(noteId, noteTitle);
                } else {
                    // Fallback: redirect to note
                    window.location.href = `index.php?note=${noteId}`;
                }
            });
        });

        // Also allow clicking on the note item itself
        modal.querySelectorAll('.calendar-note-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger if clicking the button
                if (e.target.classList.contains('calendar-note-open-btn')) return;

                const noteId = item.getAttribute('data-note-id');
                const btn = item.querySelector('.calendar-note-open-btn');
                const noteTitle = btn.getAttribute('data-note-title');

                if (window.tabManager) {
                    window.tabManager.openInNewTab(noteId, noteTitle);
                } else {
                    window.location.href = `index.php?note=${noteId}`;
                }
            });
        });
    }
}

// Initialize calendar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new MiniCalendar();
});
