(function () {
    'use strict';

    // Sync favorites preference (localStorage → URL) before the page renders.
    // Only redirects if localStorage has an explicit saved value that differs from the URL.
    var FAVORITES_KEY = 'dashboard_favorites';
    (function syncFavoritesFromStorage() {
        try {
            var stored = localStorage.getItem(FAVORITES_KEY);
            if (stored === null) return; // never set — respect current URL as-is
            var wantFavorites = stored === '1';
            var hasFavorites  = new URL(window.location.href).searchParams.get('favorites') === '1';
            if (wantFavorites === hasFavorites) return;
            var url = new URL(window.location.href);
            if (wantFavorites) {
                url.searchParams.set('favorites', '1');
            } else {
                url.searchParams.delete('favorites');
            }
            window.location.replace(url.toString());
        } catch (e) { /* localStorage or URL unavailable */ }
    })();

    var rootData  = window.DASHBOARD_DATA || { folders: [], notes: [] };
    var workspace = window.DASHBOARD_WORKSPACE || '';
    var txt       = window.DASHBOARD_TXT || {};
    var gitTxt    = window.DASHBOARD_GIT || {};

    // Navigation stack: array of folder objects navigated into.
    // Empty = at root level.
    var navStack = [];

    function currentLevel() {
        return navStack.length === 0 ? rootData : navStack[navStack.length - 1];
    }

    // --- Helpers ---

    function esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function countNotes(folder) {
        var total = folder.notes.length;
        folder.folders.forEach(function (child) { total += countNotes(child); });
        return total;
    }

    // --- Card builders ---

    function buildFolderCard(folder, index) {
        var count = countNotes(folder);
        var iconStyle = folder.color ? ' style="color:' + esc(folder.color) + ' !important"' : '';
        var search = folder.name.toLowerCase();
        return '<button class="dash-card dash-folder-card" data-type="folder" data-folder-index="' + index + '" data-search="' + esc(search) + '">' +
            '<div class="dash-card-icon"><i class="' + esc(folder.icon) + '"' + iconStyle + '></i></div>' +
            '<span class="dash-card-name">' + esc(folder.name) + '</span>' +
            '<span class="dash-card-count">' + count + '</span>' +
        '</button>';
    }

    function buildNoteCard(note) {
        var tags      = note.tags || [];
        var searchVal = (note.heading + ' ' + tags.join(' ')).toLowerCase();

        var unpin = '<button type="button" class="dash-card-unpin" data-note-id="' + note.id + '"' +
            ' title="' + esc(txt.unpin || '') + '" aria-label="' + esc(txt.unpin || '') + '">' +
            '<i class="lucide lucide-x"></i></button>';

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
        if (tags.length > 0 || note.updated) {
            footer = '<div class="board-card-footer">';
            tags.slice(0, 3).forEach(function (tag) {
                footer += '<span class="board-card-tag">' + esc(tag) + '</span>';
            });
            if (note.updated) {
                footer += '<span class="board-card-date">' + esc(note.updated) + '</span>';
            }
            footer += '</div>';
        }

        return '<div class="dash-card dash-note-card" data-note-id="' + note.id + '" data-search="' + esc(searchVal) + '">' +
            unpin +
            '<a class="dash-card-link" href="' + esc(note.url) + '">' +
                '<div class="dash-card-note-title">' + esc(note.heading) + '</div>' +
                content +
            '</a>' +
            footer +
        '</div>';
    }

    // --- Render ---

    function renderGrid(level) {
        var grid = document.getElementById('dashboardGrid');
        if (!grid) return;

        var html = '';
        level.folders.forEach(function (folder, i) { html += buildFolderCard(folder, i); });
        level.notes.forEach(function (note)         { html += buildNoteCard(note); });
        grid.innerHTML = html;

        var filterInput = document.getElementById('filterInput');
        if (filterInput && filterInput.value.trim()) {
            applyFilter(filterInput.value.trim().toLowerCase());
        }
    }

    function renderBreadcrumb() {
        var bc = document.getElementById('dashboardBreadcrumb');
        if (!bc) return;

        if (navStack.length === 0) {
            bc.style.display = 'none';
            bc.innerHTML = '';
            return;
        }

        bc.style.display = '';
        var html = '<button class="bc-home" data-depth="0"><i class="lucide lucide-home"></i></button>';
        navStack.forEach(function (folder, i) {
            html += '<i class="lucide lucide-chevron-right bc-sep"></i>';
            if (i === navStack.length - 1) {
                html += '<span class="bc-current">' + esc(folder.name) + '</span>';
            } else {
                html += '<button class="bc-item" data-depth="' + (i + 1) + '">' + esc(folder.name) + '</button>';
            }
        });
        bc.innerHTML = html;
    }

    function renderAll() {
        renderBreadcrumb();
        renderGrid(currentLevel());
    }

    // --- Navigation ---

    function navigateInto(folderIndex) {
        var level = currentLevel();
        if (folderIndex >= 0 && folderIndex < level.folders.length) {
            navStack.push(level.folders[folderIndex]);
            renderAll();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function navigateTo(depth) {
        navStack = navStack.slice(0, depth);
        renderAll();
    }

    // --- Filter ---

    function applyFilter(term) {
        var cards = document.querySelectorAll('.dash-card');
        var visibleTotal = 0;

        cards.forEach(function (card) {
            var haystack = card.getAttribute('data-search') || '';
            var match = !term || haystack.indexOf(term) !== -1;
            card.style.display = match ? '' : 'none';
            if (match) visibleTotal++;
        });

        var noResults = document.getElementById('dashboardNoResults');
        if (noResults) {
            noResults.style.display = (visibleTotal === 0 && cards.length > 0) ? 'block' : 'none';
        }
    }

    // --- Unpin ---

    function removeNoteFromData(level, noteId) {
        level.notes = level.notes.filter(function (n) { return n.id !== noteId; });
        level.folders.forEach(function (f) { removeNoteFromData(f, noteId); });
    }

    function unpinNote(noteId) {
        fetch('api/v1/notes/' + encodeURIComponent(noteId) + '/favorite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ workspace: workspace })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    var card = document.querySelector('.dash-note-card[data-note-id="' + noteId + '"]');
                    if (card) card.remove();
                    removeNoteFromData(rootData, noteId);

                    var remaining = document.querySelectorAll('.dash-card');
                    if (remaining.length === 0) window.location.reload();
                } else {
                    throw new Error(data.error || 'Request failed');
                }
            })
            .catch(function (err) {
                if (window.modalAlert) {
                    window.modalAlert.alert((txt.error || 'Error') + ': ' + err.message, 'error');
                }
            });
    }

    // --- Git sync ---

    async function readJsonResponse(response) {
        var contentType = response.headers.get('content-type') || '';
        var text = await response.text();
        var trimmed = text.trim();
        var looksLikeJson = trimmed.indexOf('{') === 0 || trimmed.indexOf('[') === 0;

        if (contentType.indexOf('application/json') !== -1 || looksLikeJson) {
            var data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error('Invalid JSON response from server.');
            }

            if (!response.ok) {
                throw new Error(data.error || data.message || 'HTTP ' + response.status);
            }

            return data;
        }

        var plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        var detail = plainText ? plainText.substring(0, 180) : 'HTTP ' + response.status;
        throw new Error(detail || 'Unexpected server response.');
    }

    function openDashboardGitModal() {
        var modal = document.getElementById('dashboardGitModal');
        if (modal) modal.style.display = 'flex';
    }

    function closeDashboardGitModal() {
        var modal = document.getElementById('dashboardGitModal');
        if (modal) modal.style.display = 'none';
    }

    function showGitError(message, title) {
        if (window.modalAlert && typeof window.modalAlert.alert === 'function') {
            window.modalAlert.alert(message, 'error', title);
        } else {
            window.alert(message);
        }
    }

    function executeDashboardGitSync(action, title) {
        if (!action) return;
        if (!window.modalAlert || typeof window.modalAlert.showProgressBar !== 'function') {
            window.location.href = gitTxt.configUrl || 'git_sync.php';
            return;
        }

        var syncStartTime = Math.floor(Date.now() / 1000);
        var syncJobId = null;
        var progressBar = window.modalAlert.showProgressBar(title, gitTxt.starting || 'Syncing...');
        var syncCompleted = false;

        var progressInterval = window.setInterval(function () {
            fetch('api/v1/git-sync/progress', { credentials: 'same-origin' })
                .then(readJsonResponse)
                .then(function (data) {
                    if (data.success && data.progress) {
                        progressBar.update(data.progress.percentage, data.progress.message);
                    }

                    var asyncResult = data.result;
                    var resultIsCurrent = asyncResult &&
                        syncJobId &&
                        asyncResult.id === syncJobId &&
                        asyncResult.result &&
                        asyncResult.action === action &&
                        (!asyncResult.finished || asyncResult.finished >= syncStartTime);

                    if (data.success && resultIsCurrent) {
                        syncCompleted = true;
                        window.clearInterval(progressInterval);
                        if (asyncResult.result.success) {
                            progressBar.update(100, gitTxt.completed || 'Completed!');
                        }
                        window.setTimeout(function () {
                            progressBar.close();
                            window.location.reload();
                        }, 500);
                    }
                })
                .catch(function () {
                    // Keep polling; the final action request below will surface hard failures.
                });
        }, 500);

        fetch('api/v1/git-sync/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ workspace: gitTxt.workspace || '', async: true })
        })
            .then(readJsonResponse)
            .then(function (data) {
                if (data.started) {
                    syncJobId = data.id || null;
                    return;
                }

                syncCompleted = true;
                window.clearInterval(progressInterval);

                if (data.success) {
                    progressBar.update(100, gitTxt.completed || 'Completed!');
                    window.setTimeout(function () {
                        progressBar.close();
                        window.location.reload();
                    }, 500);
                } else {
                    progressBar.close();
                    showGitError(data.error || data.message || (data.errors && data.errors[0] && data.errors[0].error) || 'Sync failed.', title);
                }
            })
            .catch(function (err) {
                if (syncCompleted) return;
                window.clearInterval(progressInterval);
                progressBar.close();
                showGitError((gitTxt.connectionError || 'Connection error: ') + err.message, title);
            });
    }

    function handleDashboardGitAction(actionBtn) {
        var action = actionBtn.getAttribute('data-dashboard-git-action');
        var titleEl = actionBtn.querySelector('.dashboard-git-action-title');
        var title = titleEl ? titleEl.textContent : (action === 'pull' ? 'Pull' : 'Push');
        var confirmMsg = action === 'pull' ? gitTxt.confirmPull : gitTxt.confirmPush;

        closeDashboardGitModal();

        if (window.modalAlert && typeof window.modalAlert.confirm === 'function') {
            window.modalAlert.confirm(confirmMsg).then(function (confirmed) {
                if (confirmed) executeDashboardGitSync(action, title);
            });
            return;
        }

        if (window.confirm(confirmMsg)) {
            executeDashboardGitSync(action, title);
        }
    }

    // --- Init ---

    document.addEventListener('DOMContentLoaded', function () {
        renderAll();

        var toggleFavoritesBtn = document.getElementById('dashboardToggleFavorites');
        if (toggleFavoritesBtn) {
            toggleFavoritesBtn.addEventListener('click', function (e) {
                e.preventDefault();
                var url = new URL(window.location.href);
                var isActive = toggleFavoritesBtn.classList.contains('active');
                try {
                    localStorage.setItem(FAVORITES_KEY, isActive ? '0' : '1');
                } catch (err) { /* ignore */ }
                if (isActive) {
                    url.searchParams.delete('favorites');
                } else {
                    url.searchParams.set('favorites', '1');
                }
                window.location.href = url.toString();
            });
        }

        var filterInput     = document.getElementById('filterInput');
        var clearFilterBtn  = document.getElementById('clearFilterBtn');
        var toggleFilterBtn = document.getElementById('dashboardToggleFilter');
        var filterWrap      = document.getElementById('dashboardTopbarFilter');

        function setFilterOpen(open) {
            if (!filterWrap) return;
            filterWrap.classList.toggle('is-collapsed', !open);
            if (toggleFilterBtn) {
                toggleFilterBtn.classList.toggle('active', open);
                toggleFilterBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            if (open && filterInput) {
                window.setTimeout(function () { filterInput.focus(); }, 0);
            }
        }

        if (toggleFilterBtn && filterWrap) {
            toggleFilterBtn.addEventListener('click', function (e) {
                e.preventDefault();
                var isOpen = !filterWrap.classList.contains('is-collapsed');
                if (isOpen && filterInput && filterInput.value.trim()) {
                    filterInput.focus();
                    return;
                }
                setFilterOpen(!isOpen);
            });
        }

        if (filterInput) {
            if (filterInput.value.trim()) {
                setFilterOpen(true);
                if (clearFilterBtn) clearFilterBtn.style.display = 'flex';
            }

            filterInput.addEventListener('input', function () {
                var term = this.value.trim().toLowerCase();
                applyFilter(term);
                if (clearFilterBtn) clearFilterBtn.style.display = term ? 'flex' : 'none';
            });
        }

        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function () {
                if (!filterInput) return;
                filterInput.value = '';
                applyFilter('');
                clearFilterBtn.style.display = 'none';
                filterInput.focus();
            });
        }

        var gitBtn = document.getElementById('dashboardGitBtn');
        var gitModal = document.getElementById('dashboardGitModal');
        if (gitBtn) {
            gitBtn.addEventListener('click', function (e) {
                e.preventDefault();
                openDashboardGitModal();
            });
        }

        // --- API REST modal ---
        var apiRestBtn   = document.getElementById('dashboardApiRestBtn');
        var apiRestModal = document.getElementById('dashboardApiRestModal');
        if (apiRestBtn && apiRestModal) {
            apiRestBtn.addEventListener('click', function () {
                apiRestModal.style.display = 'flex';
            });
            apiRestModal.addEventListener('click', function (e) {
                if (e.target === apiRestModal) apiRestModal.style.display = 'none';
            });
            var ghBtn = document.getElementById('dashboardOpenGithubApiDocsBtn');
            if (ghBtn) ghBtn.addEventListener('click', function () {
                window.open('https://github.com/timothepoznanski/poznote/blob/main/docs/API-REST.md', '_blank');
                apiRestModal.style.display = 'none';
            });
            var swBtn = document.getElementById('dashboardOpenSwaggerApiBtn');
            if (swBtn) swBtn.addEventListener('click', function () {
                apiRestModal.style.display = 'none';
                window.location.href = 'api-docs/';
            });
            var closeBtn = document.getElementById('dashboardCloseApiRestModalBtn');
            if (closeBtn) closeBtn.addEventListener('click', function () {
                apiRestModal.style.display = 'none';
            });
        }

        Array.prototype.forEach.call(document.querySelectorAll('[data-dashboard-git-action]'), function (actionBtn) {
            actionBtn.addEventListener('click', function () {
                handleDashboardGitAction(actionBtn);
            });
        });

        Array.prototype.forEach.call(document.querySelectorAll('[data-action="close-dashboard-git-modal"]'), function (closeBtn) {
            closeBtn.addEventListener('click', closeDashboardGitModal);
        });

        if (gitModal) {
            gitModal.addEventListener('click', function (e) {
                if (e.target === gitModal) closeDashboardGitModal();
            });
        }

        document.addEventListener('click', function (e) {
            var bcBtn = e.target.closest('.bc-home, .bc-item');
            if (bcBtn) {
                var depth = parseInt(bcBtn.getAttribute('data-depth') || '0', 10);
                navigateTo(depth);
                return;
            }

            var folderCard = e.target.closest('.dash-folder-card');
            if (folderCard) {
                var idx = parseInt(folderCard.getAttribute('data-folder-index') || '0', 10);
                navigateInto(idx);
                return;
            }

            var unpinBtn = e.target.closest('.dash-card-unpin');
            if (unpinBtn) {
                e.preventDefault();
                e.stopPropagation();
                var noteId = parseInt(unpinBtn.getAttribute('data-note-id') || '0', 10);
                if (noteId) unpinNote(noteId);
            }
        });
    });
})();
