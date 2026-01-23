(function () {
    'use strict';

    function getConfig() {
        var body = document.body;
        return {
            workspace: body.getAttribute('data-workspace') || '',
            txtError: body.getAttribute('data-txt-error') || 'Error',
            txtUntitled: body.getAttribute('data-txt-untitled') || 'Untitled',
            txtNoFilterResults: body.getAttribute('data-txt-no-filter-results') || 'No notes match your search.',
            txtToday: body.getAttribute('data-txt-today') || 'Today',
            txtYesterday: body.getAttribute('data-txt-yesterday') || 'Yesterday',
            txtDaysAgo: body.getAttribute('data-txt-days-ago') || 'days ago'
        };
    }

    var config = getConfig();
    var favoriteNotes = [];
    var filteredNotes = [];
    var filterText = '';

    function loadFavorites() {
        var spinner = document.getElementById('loadingSpinner');
        var container = document.getElementById('favoritesNotesContainer');
        var emptyMessage = document.getElementById('emptyMessage');

        if (spinner) spinner.style.display = 'block';
        if (container) container.innerHTML = '';
        if (emptyMessage) emptyMessage.style.display = 'none';

        var params = new URLSearchParams();
        params.append('favorite', '1');
        if (config.workspace) {
            params.append('workspace', config.workspace);
        }

        fetch('api/v1/notes?' + params.toString())
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.error) throw new Error(data.error);

                favoriteNotes = data.notes || [];
                if (spinner) spinner.style.display = 'none';

                if (favoriteNotes.length === 0) {
                    if (emptyMessage) emptyMessage.style.display = 'block';
                    return;
                }

                applyFilter();
            })
            .catch(function (error) {
                if (spinner) spinner.style.display = 'none';
                if (container) {
                    container.innerHTML = '<div class="error-message">' + config.txtError + ': ' + error.message + '</div>';
                }
            });
    }

    function applyFilter() {
        if (!filterText) {
            filteredNotes = favoriteNotes.slice();
        } else {
            filteredNotes = favoriteNotes.filter(function (note) {
                var heading = (note.heading || '').toLowerCase();
                var folder = (note.folder || '').toLowerCase();
                return heading.includes(filterText) || folder.includes(filterText);
            });
        }
        renderFavorites();
        updateFilterStats();
    }

    function updateFilterStats() {
        var statsDiv = document.getElementById('filterStats');
        if (statsDiv) {
            if (filterText && filteredNotes.length < favoriteNotes.length) {
                statsDiv.textContent = filteredNotes.length + ' / ' + favoriteNotes.length;
                statsDiv.style.display = 'block';
            } else {
                statsDiv.style.display = 'none';
            }
        }
    }

    function toggleFavorite(noteId) {
        fetch('api/v1/notes/' + noteId + '/favorite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace: config.workspace })
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (data.success) {
                    favoriteNotes = favoriteNotes.filter(function (n) { return n.id != noteId; });
                    applyFilter();
                    if (favoriteNotes.length === 0) {
                        document.getElementById('emptyMessage').style.display = 'block';
                    }
                }
            });
    }

    function renderFavorites() {
        var container = document.getElementById('favoritesNotesContainer');
        if (!container) return;
        container.innerHTML = '';

        if (filteredNotes.length === 0 && filterText) {
            container.innerHTML = '<div class="empty-message"><p>' + config.txtNoFilterResults + '</p></div>';
            return;
        }

        var list = document.createElement('div');
        list.className = 'favorites-notes-list';

        filteredNotes.forEach(function (note) {
            var item = document.createElement('div');
            item.className = 'favorite-note-item';

            var info = document.createElement('div');
            info.className = 'note-info';

            var titleLine = document.createElement('div');
            titleLine.className = 'note-title-line';

            var link = document.createElement('a');
            link.className = 'note-name';
            link.href = 'index.php?note=' + note.id + (config.workspace ? '&workspace=' + encodeURIComponent(config.workspace) : '');
            link.textContent = note.heading || config.txtUntitled;
            titleLine.appendChild(link);

            if (note.folder) {
                var badge = document.createElement('span');
                badge.className = 'folder-badge';
                badge.innerHTML = '<i class="fas fa-folder"></i> ' + note.folder;
                titleLine.appendChild(badge);
            }

            info.appendChild(titleLine);
            item.appendChild(info);

            var actions = document.createElement('div');
            actions.className = 'note-actions';

            var starBtn = document.createElement('button');
            starBtn.className = 'btn-unfavorite';
            starBtn.innerHTML = '<i class="fas fa-star"></i>';
            starBtn.title = 'Remove from favorites';
            starBtn.onclick = function () { toggleFavorite(note.id); };

            actions.appendChild(starBtn);
            item.appendChild(actions);

            list.appendChild(item);
        });

        container.appendChild(list);
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        var date = new Date(dateString);
        var now = new Date();
        var diffMs = now - date;
        var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return config.txtToday;
        if (diffDays === 1) return config.txtYesterday;
        if (diffDays < 7) return diffDays + ' ' + config.txtDaysAgo;
        return date.toLocaleDateString();
    }

    document.addEventListener('DOMContentLoaded', function () {
        var backHomeBtn = document.getElementById('backToHomeBtn');
        if (backHomeBtn) {
            backHomeBtn.addEventListener('click', function () {
                window.location.href = 'home.php';
            });
        }

        var backNotesBtn = document.getElementById('backToNotesBtn');
        if (backNotesBtn) {
            backNotesBtn.addEventListener('click', function () {
                var url = 'index.php' + (config.workspace ? '?workspace=' + encodeURIComponent(config.workspace) : '');
                window.location.href = url;
            });
        }

        var filterInput = document.getElementById('filterInput');
        if (filterInput) {
            filterInput.addEventListener('input', function () {
                filterText = this.value.trim().toLowerCase();
                applyFilter();
                document.getElementById('clearFilterBtn').style.display = filterText ? 'flex' : 'none';
            });
        }

        var clearFilterBtn = document.getElementById('clearFilterBtn');
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function () {
                filterInput.value = '';
                filterText = '';
                applyFilter();
                clearFilterBtn.style.display = 'none';
                filterInput.focus();
            });
        }

        loadFavorites();
    });
})();
