// Positioned calendar popup shared by the slash menu (slash-command.js),
// tasklist due dates (tasklist.js) and the tasks page (tasks-page.js).
//
// The native <input type="date"> picker cannot be used here: the browser
// decides where to open it and, at least on Chromium/Linux, showPicker()
// ignores the input position entirely and opens the calendar in the top-left
// corner of the window. This popup is positioned like the slash menu itself.
//
// Styles live in css/slash-commands.css (.slash-date-picker*) with dark-mode
// overrides in css/dark-mode/menus.css. Localized labels come from
// window.calendarTranslations when the page defines it.
(function () {
    'use strict';

    function escapeHtmlAttributeValue(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    let slashDatePickerCleanup = null;

    function closeSlashDatePicker() {
        if (slashDatePickerCleanup) slashDatePickerCleanup();
    }

    function showSlashDatePicker(anchorRect, onPick, onDismiss, options) {
        closeSlashDatePicker();

        const t9n = window.calendarTranslations || {};
        const months = (Array.isArray(t9n.months) && t9n.months.length === 12) ? t9n.months
            : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const weekdays = (Array.isArray(t9n.weekdays) && t9n.weekdays.length === 7) ? t9n.weekdays
            : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
        const esc = escapeHtmlAttributeValue;

        const today = new Date();
        let viewYear = today.getFullYear();
        let viewMonth = today.getMonth();

        // Currently selected day ('YYYY-MM-DD'), seeded from options.initialDate.
        // Highlighted in the grid, and the date a typed time applies to.
        let selectedDayStr = null;
        if (options && typeof options.initialDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(options.initialDate)) {
            selectedDayStr = options.initialDate.substring(0, 10);
            viewYear = parseInt(selectedDayStr.substring(0, 4), 10);
            viewMonth = parseInt(selectedDayStr.substring(5, 7), 10) - 1;
        }

        // Selected time ('HH:MM' or '') and the state of the two-step time
        // menu: pick the hour first, then the minutes
        let selectedTime = (options && typeof options.initialTime === 'string' && /^\d{2}:\d{2}/.test(options.initialTime))
            ? options.initialTime.substring(0, 5)
            : '';
        let timeMenuMode = null; // null | 'hours' | 'minutes'
        let timeMenuHour = null;

        // Time-only mode: open straight on the hour menu; picking the minutes
        // returns the time and closes (no calendar involved)
        const timeOnly = !!(options && options.timeOnly);
        if (timeOnly) {
            timeMenuMode = 'hours';
            timeMenuHour = selectedTime !== '' ? parseInt(selectedTime.substring(0, 2), 10) : null;
        }

        const picker = document.createElement('div');
        picker.className = 'slash-date-picker';

        function dayString(year, month, day) {
            return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        }

        function pad2(value) {
            return String(value).padStart(2, '0');
        }

        // Display an 'HH:MM' value following the user's date/time format setting
        function formatTimeLabel(timeStr) {
            if (!/^\d{2}:\d{2}$/.test(timeStr || '')) return '--:--';
            if (typeof window.poznoteFormatTimeOnly === 'function') {
                return window.poznoteFormatTimeOnly(new Date(2000, 0, 1,
                    parseInt(timeStr.substring(0, 2), 10),
                    parseInt(timeStr.substring(3, 5), 10)));
            }
            return timeStr;
        }

        function renderTimeMenu() {
            const title = timeMenuMode === 'minutes'
                ? pad2(timeMenuHour) + ':--'
                : (selectedTime ? formatTimeLabel(selectedTime) : '--:--');

            let html = '<div class="slash-date-picker-header">'
                + '<button type="button" class="slash-date-picker-nav" data-time-back="1">&#8249;</button>'
                + '<span class="slash-date-picker-title">' + esc(title) + '</span>'
                + '<span class="slash-date-picker-nav"></span>'
                + '</div>';

            if (timeMenuMode === 'hours') {
                html += '<div class="slash-time-grid hours">';
                for (let h = 0; h < 24; h++) {
                    const isSelected = selectedTime !== '' && parseInt(selectedTime.substring(0, 2), 10) === h;
                    html += '<button type="button" class="slash-time-cell' + (isSelected ? ' selected' : '') + '" data-hour="' + h + '">' + pad2(h) + '</button>';
                }
                html += '</div>';
            } else {
                html += '<div class="slash-time-grid minutes">';
                for (let m = 0; m < 60; m += 5) {
                    const isSelected = selectedTime === pad2(timeMenuHour) + ':' + pad2(m);
                    html += '<button type="button" class="slash-time-cell' + (isSelected ? ' selected' : '') + '" data-minute="' + m + '">' + pad2(timeMenuHour) + ':' + pad2(m) + '</button>';
                }
                html += '</div>';
            }

            picker.innerHTML = html;
        }

        function render() {
            if (options && (options.withTime || timeOnly) && timeMenuMode) {
                renderTimeMenu();
                return;
            }

            const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
            const firstDay = new Date(viewYear, viewMonth, 1).getDay();
            // Monday-first, same convention as the sidebar mini calendar
            const leadingBlanks = firstDay === 0 ? 6 : firstDay - 1;

            let html = '<div class="slash-date-picker-header">'
                + '<button type="button" class="slash-date-picker-nav" data-nav="-1" title="' + esc(t9n.previousMonth || 'Previous month') + '">&#8249;</button>'
                + '<span class="slash-date-picker-title">' + esc(months[viewMonth]) + ' ' + viewYear + '</span>'
                + '<button type="button" class="slash-date-picker-nav" data-nav="1" title="' + esc(t9n.nextMonth || 'Next month') + '">&#8250;</button>'
                + '</div><div class="slash-date-picker-grid">';
            for (let i = 0; i < 7; i++) {
                html += '<span class="slash-date-picker-weekday">' + esc(weekdays[i]) + '</span>';
            }
            for (let i = 0; i < leadingBlanks; i++) {
                html += '<span></span>';
            }
            for (let day = 1; day <= daysInMonth; day++) {
                const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                const isSelected = selectedDayStr === dayString(viewYear, viewMonth, day);
                html += '<button type="button" class="slash-date-picker-day' + (isToday ? ' today' : '') + (isSelected ? ' selected' : '') + '" data-day="' + day + '">' + day + '</button>';
            }
            html += '</div>';

            const applyLabel = esc(t9n.apply || 'Apply');
            const removable = options && options.removeLabel && typeof options.onRemove === 'function';

            if (options && options.withTime) {
                // Day clicks and time edits only update the selection; the
                // single apply button at the bottom saves and closes.
                html += '<div class="slash-date-picker-footer">'
                    + '<button type="button" class="slash-date-picker-today-btn" data-today="1">' + esc(t9n.today || 'Today') + '</button>'
                    + '<button type="button" class="slash-date-picker-time-btn" data-time-menu="1"><i class="lucide lucide-clock"></i>' + esc(selectedTime ? formatTimeLabel(selectedTime) : '--:--') + '</button>'
                    + '</div>'
                    + '<div class="slash-date-picker-actions-row">';
                if (removable) {
                    html += '<button type="button" class="slash-date-picker-remove-btn" data-remove="1"><i class="lucide lucide-calendar-alt"></i>' + esc(options.removeLabel) + '</button>';
                }
                if (selectedTime && options.removeTimeLabel) {
                    html += '<button type="button" class="slash-date-picker-remove-time-btn" data-remove-time="1"><i class="lucide lucide-clock"></i>' + esc(options.removeTimeLabel) + '</button>';
                }
                html += '<button type="button" class="slash-date-picker-apply-btn" data-apply="1">' + applyLabel + '</button>'
                    + '</div>';
            } else {
                html += '<div class="slash-date-picker-footer">'
                    + '<button type="button" class="slash-date-picker-today-btn" data-today="1">' + esc(t9n.today || 'Today') + '</button>';
                if (removable) {
                    html += '<button type="button" class="slash-date-picker-remove-btn" data-remove="1">' + esc(options.removeLabel) + '</button>';
                }
                html += '</div>';
            }
            picker.innerHTML = html;
        }

        let picked = false;
        function cleanup() {
            document.removeEventListener('mousedown', handleOutsideMouseDown, true);
            document.removeEventListener('keydown', handleEscape, true);
            if (picker.parentNode) picker.parentNode.removeChild(picker);
            slashDatePickerCleanup = null;
            if (!picked && typeof onDismiss === 'function') onDismiss();
        }

        function currentTimeValue() {
            if (!options || !options.withTime) return '';
            return /^\d{2}:\d{2}$/.test(selectedTime) ? selectedTime : '';
        }

        function pick(date) {
            // With the time field enabled, a picked day carries the typed time
            // along ('' when left empty, i.e. a date-only choice)
            const time = currentTimeValue();
            picked = true;
            cleanup();
            onPick(date, time);
        }

        // Apply the current selection (day + time) and close. Falls back to
        // today when no day was selected yet.
        function applySelection() {
            const dayStr = selectedDayStr
                || dayString(today.getFullYear(), today.getMonth(), today.getDate());
            const date = new Date(
                parseInt(dayStr.substring(0, 4), 10),
                parseInt(dayStr.substring(5, 7), 10) - 1,
                parseInt(dayStr.substring(8, 10), 10)
            );
            const time = currentTimeValue();
            picked = true;
            cleanup();
            onPick(date, time);
        }

        function handleOutsideMouseDown(e) {
            if (!picker.contains(e.target)) cleanup();
        }

        function handleEscape(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
            }
        }

        // Keep the caret/selection in the editor while interacting with the popup
        picker.addEventListener('mousedown', function (e) { e.preventDefault(); });
        picker.addEventListener('click', function (e) {
            const nav = e.target.closest('[data-nav]');
            if (nav) {
                viewMonth += parseInt(nav.getAttribute('data-nav'), 10);
                if (viewMonth < 0) { viewMonth = 11; viewYear--; }
                if (viewMonth > 11) { viewMonth = 0; viewYear++; }
                render();
                return;
            }
            if (e.target.closest('[data-apply]')) {
                applySelection();
                return;
            }
            if (e.target.closest('[data-today]')) {
                if (options && options.withTime) {
                    // Select today (and jump the view to it); apply confirms
                    selectedDayStr = dayString(today.getFullYear(), today.getMonth(), today.getDate());
                    viewYear = today.getFullYear();
                    viewMonth = today.getMonth();
                    render();
                } else {
                    pick(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
                }
                return;
            }
            if (e.target.closest('[data-remove]')) {
                picked = true;
                cleanup();
                options.onRemove();
                return;
            }
            if (e.target.closest('[data-remove-time]')) {
                // Clear the time in the current selection; the popup stays
                // open and apply confirms
                selectedTime = '';
                render();
                return;
            }
            if (e.target.closest('[data-time-menu]')) {
                // Open the two-step time menu: hours first
                timeMenuMode = 'hours';
                timeMenuHour = selectedTime !== '' ? parseInt(selectedTime.substring(0, 2), 10) : null;
                render();
                return;
            }
            if (e.target.closest('[data-time-back]')) {
                // Step back: minutes -> hours -> calendar (or close in
                // time-only mode, where there is no calendar behind)
                if (timeMenuMode === 'minutes') {
                    timeMenuMode = 'hours';
                    render();
                } else if (timeOnly) {
                    cleanup();
                } else {
                    timeMenuMode = null;
                    render();
                }
                return;
            }
            const hourBtn = e.target.closest('[data-hour]');
            if (hourBtn) {
                timeMenuHour = parseInt(hourBtn.getAttribute('data-hour'), 10);
                timeMenuMode = 'minutes';
                render();
                return;
            }
            const minuteBtn = e.target.closest('[data-minute]');
            if (minuteBtn) {
                // Picking the minutes completes the time and closes the menu
                selectedTime = pad2(timeMenuHour) + ':' + pad2(parseInt(minuteBtn.getAttribute('data-minute'), 10));
                if (timeOnly) {
                    picked = true;
                    cleanup();
                    onPick(null, selectedTime);
                    return;
                }
                timeMenuMode = null;
                render();
                return;
            }
            const dayBtn = e.target.closest('[data-day]');
            if (dayBtn) {
                if (options && options.withTime) {
                    // Day clicks only move the selection; apply confirms
                    selectedDayStr = dayString(viewYear, viewMonth, parseInt(dayBtn.getAttribute('data-day'), 10));
                    render();
                } else {
                    pick(new Date(viewYear, viewMonth, parseInt(dayBtn.getAttribute('data-day'), 10)));
                }
            }
        });

        render();
        document.body.appendChild(picker);

        const padding = 8;
        const pickerRect = picker.getBoundingClientRect();
        const rect = anchorRect || { left: (window.innerWidth - pickerRect.width) / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
        const x = Math.min(rect.left, window.innerWidth - pickerRect.width - padding);
        let y = rect.bottom + 6;
        if (y + pickerRect.height > window.innerHeight - padding) {
            y = Math.max(padding, rect.top - pickerRect.height - 6);
        }
        picker.style.left = Math.max(padding, x) + 'px';
        picker.style.top = y + 'px';

        document.addEventListener('mousedown', handleOutsideMouseDown, true);
        document.addEventListener('keydown', handleEscape, true);

        slashDatePickerCleanup = cleanup;

        // Keep the mobile virtual keyboard closed while the calendar is open;
        // the editor gets focused again on pick, when the insertion needs it.
        if (window.innerWidth < 768) {
            const active = document.activeElement;
            if (active && typeof active.blur === 'function') {
                try { active.blur(); } catch (e) { }
            }
        }
    }

    window.showSlashDatePicker = showSlashDatePicker;
    window.closeSlashDatePicker = closeSlashDatePicker;
    window.isSlashDatePickerOpen = function () {
        return !!slashDatePickerCleanup;
    };
})();
