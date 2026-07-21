(function () {
    'use strict';

    var data = window.DIARY_DATA || { notes: [] };
    var notes = data.notes || [];
    var txt = data.txt || {};
    var activeFilterTerm = '';

    // --- Helpers (same conventions as dashboard-page.js) ---

    function esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeSearchText(value) {
        var text = String(value || '').toLowerCase();
        if (typeof text.normalize === 'function') {
            text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
        return text;
    }

    function getNoteSearchValue(note) {
        var tags = note.tags || [];
        var taskText = '';
        if (Array.isArray(note.tasks)) {
            taskText = note.tasks.map(function (task) { return task.text || ''; }).join(' ');
        }
        return normalizeSearchText(note.search || (note.heading + ' ' + tags.join(' ') + ' ' + (note.text || '') + ' ' + taskText));
    }

    function noteMatchesSearch(note, term) {
        var haystack = getNoteSearchValue(note);
        var tokens = term.split(/\s+/).filter(Boolean);
        return tokens.every(function (token) {
            return haystack.indexOf(token) !== -1;
        });
    }

    function monthKey(note) {
        // note.created is 'YYYY-MM-DD' in the user's timezone
        return String(note.created || '').slice(0, 7);
    }

    function monthLabel(key) {
        var parts = key.split('-');
        var year = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10);
        if (!year || !month) return key;
        var date = new Date(year, month - 1, 1);
        try {
            var label = date.toLocaleDateString(data.lang || undefined, { month: 'long', year: 'numeric' });
            return label.charAt(0).toUpperCase() + label.slice(1);
        } catch (e) {
            return key;
        }
    }

    // --- Card builder (mirrors dashboard-page.js buildNoteCard) ---

    function buildNoteCard(note) {
        var tags = note.tags || [];
        var isToday = data.todayNoteId && note.id === data.todayNoteId;

        var content = '';
        if (note.tasks !== null && note.tasks !== undefined && note.tasks.length > 0) {
            content = '<ul class="board-card-tasks">';
            note.tasks.forEach(function (task) {
                content += '<li class="' + (task.done ? 'done' : '') + '">' +
                    '<i class="lucide ' + (task.done ? 'lucide-check-square' : 'lucide-square') + '"></i>' +
                    '<span>' + esc(task.text) + '</span></li>';
            });
            content += '</ul>';
        } else if (note.text) {
            content = '<div class="board-card-excerpt">' + esc(note.text) + '</div>';
        }

        var footer = '';
        if (tags.length > 0 || isToday) {
            footer = '<div class="board-card-footer">';
            if (isToday) {
                footer += '<span class="board-card-tag diary-today-tag">' + esc(txt.today || 'Today') + '</span>';
            }
            tags.slice(0, 3).forEach(function (tag) {
                footer += '<span class="board-card-tag">' + esc(tag) + '</span>';
            });
            footer += '</div>';
        }

        var iconHtml = '';
        if (note.icon) {
            if (note.icon.indexOf('lucide') !== -1) {
                var iconStyle = note.iconColor ? ' style="color:' + esc(note.iconColor) + ' !important"' : '';
                iconHtml = '<i class="' + esc(note.icon) + ' dash-note-icon"' + iconStyle + '></i>';
            } else {
                iconHtml = '<span class="dash-note-icon dash-note-icon-emoji">' + esc(note.icon) + '</span>';
            }
        }

        return '<div class="dash-card dash-note-card' + (isToday ? ' diary-card-today' : '') + '" data-note-id="' + note.id + '" title="' + esc(note.heading) + '">' +
            '<a class="dash-card-link" href="' + esc(note.url) + '">' +
                '<div class="dash-card-note-title">' + iconHtml + esc(note.heading) + '</div>' +
                content +
            '</a>' +
            footer +
        '</div>';
    }

    // --- Render ---

    function render() {
        var container = document.getElementById('diaryContent');
        if (!container) return;

        var visibleNotes = notes;
        if (activeFilterTerm) {
            visibleNotes = notes.filter(function (note) {
                return noteMatchesSearch(note, activeFilterTerm);
            });
        }

        var noResults = document.getElementById('diaryNoResults');
        if (noResults) {
            noResults.style.display = (activeFilterTerm && visibleNotes.length === 0) ? 'block' : 'none';
        }

        // Notes arrive sorted by created DESC; group them by month preserving order.
        var html = '';
        var currentMonth = null;
        visibleNotes.forEach(function (note) {
            var key = monthKey(note);
            if (key !== currentMonth) {
                if (currentMonth !== null) html += '</div></section>';
                currentMonth = key;
                html += '<section class="diary-month">' +
                    '<h2 class="diary-month-title">' + esc(monthLabel(key)) + '</h2>' +
                    '<div class="dashboard-grid-container">';
            }
            html += buildNoteCard(note);
        });
        if (currentMonth !== null) html += '</div></section>';

        container.innerHTML = html;
    }

    // --- Today's entry ---

    function openNote(noteId) {
        var url = 'index.php?note=' + encodeURIComponent(noteId) + '&newtab=1';
        if (data.pageWorkspace) {
            url += '&workspace=' + encodeURIComponent(data.pageWorkspace);
        }
        window.location.href = url;
    }

    function showError(message) {
        if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
            window.modalAlert.alert(message, 'error');
        } else {
            window.alert(message);
        }
    }

    function handleTodayClick(btn) {
        if (data.todayNoteId) {
            openNote(data.todayNoteId);
            return;
        }

        btn.disabled = true;
        fetch('api/v1/notes', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({
                heading: data.todayTitle,
                folder_name: data.folderPath,
                workspace: data.workspace,
                type: 'note'
            })
        })
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (result.success && result.note) {
                    openNote(result.note.id);
                } else {
                    btn.disabled = false;
                    showError(result.error || result.message || txt.createError || 'Could not create the diary entry.');
                }
            })
            .catch(function (err) {
                btn.disabled = false;
                showError((txt.createError || 'Could not create the diary entry.') + ' ' + err.message);
            });
    }

    // --- Init ---

    document.addEventListener('DOMContentLoaded', function () {
        render();

        var todayBtn = document.getElementById('diaryTodayBtn');
        if (todayBtn) {
            todayBtn.addEventListener('click', function () {
                handleTodayClick(todayBtn);
            });

            // today=1 (set by the "Diary entry" card on create.php) triggers the
            // open-or-create flow on load. The param is stripped first so going
            // back to this page does not re-trigger it.
            try {
                var pageUrl = new URL(window.location.href);
                if (pageUrl.searchParams.get('today') === '1') {
                    pageUrl.searchParams.delete('today');
                    window.history.replaceState(null, '', pageUrl.toString());
                    handleTodayClick(todayBtn);
                }
            } catch (e) { /* URL API unavailable */ }
        }

        var filterInput = document.getElementById('filterInput');
        var clearFilterBtn = document.getElementById('clearFilterBtn');

        if (filterInput) {
            filterInput.addEventListener('input', function () {
                var term = this.value.trim();
                activeFilterTerm = normalizeSearchText(term);
                render();
                if (clearFilterBtn) clearFilterBtn.style.display = term ? 'flex' : 'none';
            });
        }

        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function () {
                if (filterInput) {
                    filterInput.value = '';
                    filterInput.focus();
                }
                activeFilterTerm = '';
                render();
                clearFilterBtn.style.display = 'none';
            });
        }
    });
})();
