(function () {
    'use strict';

    // Sync favorites preference (localStorage → URL) before the page renders.
    // Only redirects if localStorage has an explicit saved value that differs from the URL.
    var FAVORITES_KEY = 'dashboard_favorites';
    var FILTER_OPEN_KEY = 'dashboard_filter_open';
    var FILTER_VALUE_KEY = 'dashboard_filter_value';
    var NAV_PATH_KEY = 'dashboard_nav_path';
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
    var gitTxt    = window.DASHBOARD_GIT || {};

    // Navigation stack: array of folder objects navigated into.
    // Empty = at root level.
    var navStack = [];
    var activeFilterTerm = '';
    var allNotesCache = null;

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

    function dashboardStorageKey(baseKey) {
        var workspace = '';
        var favoritesMode = 'all';

        try {
            workspace = document.body && document.body.dataset ? (document.body.dataset.workspace || '') : '';
            favoritesMode = new URL(window.location.href).searchParams.get('favorites') === '1' ? 'favorites' : 'all';
        } catch (err) { /* ignore */ }

        return baseKey + ':' + encodeURIComponent(workspace) + ':' + favoritesMode;
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

    function collectNotes(level, notes) {
        (level.notes || []).forEach(function (note) { notes.push(note); });
        (level.folders || []).forEach(function (folder) { collectNotes(folder, notes); });
    }

    function getAllNotes() {
        if (!allNotesCache) {
            allNotesCache = [];
            collectNotes(rootData, allNotesCache);
        }
        return allNotesCache;
    }

    function noteMatchesSearch(note, term) {
        var haystack = getNoteSearchValue(note);
        var tokens = term.split(/\s+/).filter(Boolean);
        return tokens.every(function (token) {
            return haystack.indexOf(token) !== -1;
        });
    }

    function setNoResultsVisible(visible) {
        var noResults = document.getElementById('dashboardNoResults');
        if (noResults) {
            noResults.style.display = visible ? 'block' : 'none';
        }
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

    function buildNoteTooltip(note, tags) {
        var lines = [note.heading || ''];
        if (tags.length > 0) {
            lines.push('Tags: ' + tags.join(', '));
        }
        return lines.join('\n');
    }

    function buildNoteCard(note) {
        var tags      = note.tags || [];
        var searchVal = getNoteSearchValue(note);
        var tooltip   = buildNoteTooltip(note, tags);

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

        return '<div class="dash-card dash-note-card" data-note-id="' + note.id + '" data-search="' + esc(searchVal) + '" title="' + esc(tooltip) + '">' +
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
        if (activeFilterTerm) {
            var matchingNotes = getAllNotes().filter(function (note) {
                return noteMatchesSearch(note, activeFilterTerm);
            });
            matchingNotes.forEach(function (note) { html += buildNoteCard(note); });
            setNoResultsVisible(matchingNotes.length === 0);
        } else {
            level.folders.forEach(function (folder, i) { html += buildFolderCard(folder, i); });
            level.notes.forEach(function (note)         { html += buildNoteCard(note); });
            setNoResultsVisible(false);
        }
        grid.innerHTML = html;
    }

    function renderBreadcrumb() {
        var bc = document.getElementById('dashboardBreadcrumb');
        if (!bc) return;

        if (activeFilterTerm || navStack.length === 0) {
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

    function findFolderAtLevel(level, folderId) {
        var id = String(folderId);
        var folders = level && Array.isArray(level.folders) ? level.folders : [];
        for (var i = 0; i < folders.length; i++) {
            if (String(folders[i].id) === id) {
                return folders[i];
            }
        }
        return null;
    }

    function saveNavigationPath() {
        try {
            var path = navStack.map(function (folder) { return folder.id; });
            localStorage.setItem(dashboardStorageKey(NAV_PATH_KEY), JSON.stringify(path));
        } catch (err) { /* ignore */ }
    }

    function restoreNavigationPath() {
        var storedPath;
        try {
            storedPath = JSON.parse(localStorage.getItem(dashboardStorageKey(NAV_PATH_KEY)) || '[]');
        } catch (err) {
            storedPath = [];
        }

        if (!Array.isArray(storedPath)) {
            storedPath = [];
        }

        var level = rootData;
        var restoredStack = [];
        for (var i = 0; i < storedPath.length; i++) {
            var folder = findFolderAtLevel(level, storedPath[i]);
            if (!folder) break;
            restoredStack.push(folder);
            level = folder;
        }

        navStack = restoredStack;
        if (restoredStack.length !== storedPath.length) {
            saveNavigationPath();
        }
    }

    function navigateInto(folderIndex) {
        var level = currentLevel();
        if (folderIndex >= 0 && folderIndex < level.folders.length) {
            navStack.push(level.folders[folderIndex]);
            saveNavigationPath();
            renderAll();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function navigateTo(depth) {
        navStack = navStack.slice(0, depth);
        saveNavigationPath();
        renderAll();
    }

    // --- Filter ---

    function applyFilter(term) {
        activeFilterTerm = normalizeSearchText(term.trim());
        renderAll();
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

    function buildDashboardGitApiUrl(path) {
        var url = path;
        try {
            var apiUrl = new URL(path, window.location.href);
            apiUrl.searchParams.set('_', String(Date.now()));
            url = apiUrl.toString();
        } catch (e) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + '_=' + encodeURIComponent(String(Date.now()));
        }
        return url;
    }

    function isCurrentGitSyncResult(asyncResult, action, syncJobId, syncStartTime, startResponseReceived) {
        if (!asyncResult || !asyncResult.result || asyncResult.action !== action) {
            return false;
        }

        if (asyncResult.finished && asyncResult.finished < syncStartTime) {
            return false;
        }

        if (syncJobId) {
            return asyncResult.id === syncJobId;
        }

        return !!startResponseReceived;
    }

    function parseGitSyncTimestampSeconds(value) {
        if (!value) return 0;
        var parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
    }

    function fetchDashboardGitJson(path, options) {
        var fetchOptions = options || {};
        fetchOptions.credentials = 'same-origin';
        fetchOptions.cache = 'no-store';
        fetchOptions.headers = Object.assign({
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }, fetchOptions.headers || {});

        return fetch(buildDashboardGitApiUrl(path), fetchOptions).then(readJsonResponse);
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
        var startResponseReceived = false;
        var syncStartServerTime = 0;
        var initialLastSyncTimestamp = gitTxt.lastSyncTimestamp || '';
        var statusInterval = null;

        progressBar.update(0, gitTxt.starting || 'Syncing...');

        function completeFromResult(asyncResult) {
            if (syncCompleted) return;
            syncCompleted = true;
            window.clearInterval(progressInterval);
            if (statusInterval !== null) {
                window.clearInterval(statusInterval);
            }
            if (asyncResult.result.success) {
                progressBar.update(100, gitTxt.completed || 'Completed!');
            }
            window.setTimeout(function () {
                progressBar.close();
                window.location.reload();
            }, 500);
        }

        function completeFromStatus(lastSync) {
            completeFromResult({
                action: action,
                result: { success: true }
            });
        }

        function lastSyncMatchesCurrentAction(lastSync) {
            if (!lastSync || lastSync.action !== action) {
                return false;
            }

            if (lastSync.timestamp && initialLastSyncTimestamp) {
                return lastSync.timestamp !== initialLastSyncTimestamp;
            }

            var lastSyncTime = parseGitSyncTimestampSeconds(lastSync.timestamp);
            if (syncStartServerTime > 0 && lastSyncTime >= syncStartServerTime) {
                return true;
            }

            return false;
        }

        function pollGitSyncStatus() {
            if (syncCompleted) return;

            fetchDashboardGitJson('api/v1/git-sync/status')
                .then(function (data) {
                    if (syncCompleted || !data.success) return;
                    if (lastSyncMatchesCurrentAction(data.lastSync)) {
                        completeFromStatus(data.lastSync);
                    }
                })
                .catch(function () {
                    // Progress polling remains the primary path; status is a fallback.
                });
        }

        var progressInterval = window.setInterval(function () {
            fetchDashboardGitJson('api/v1/git-sync/progress')
                .then(function (data) {
                    if (data.success && data.progress) {
                        progressBar.update(data.progress.percentage, data.progress.message);
                    }

                    var asyncResult = data.result;
                    var resultIsCurrent = isCurrentGitSyncResult(
                        asyncResult,
                        action,
                        syncJobId,
                        syncStartTime,
                        startResponseReceived
                    );

                    if (data.success && resultIsCurrent) {
                        completeFromResult(asyncResult);
                    }
                })
                .catch(function () {
                    // Keep polling; the final action request below will surface hard failures.
                });
        }, 500);

        fetchDashboardGitJson('api/v1/git-sync/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace: gitTxt.workspace || '', async: true })
        })
            .then(function (data) {
                startResponseReceived = true;
                if (data.started) {
                    syncJobId = data.id || null;
                    syncStartServerTime = data.startedAt || 0;
                    statusInterval = window.setInterval(pollGitSyncStatus, 1500);
                    return;
                }

                syncCompleted = true;
                window.clearInterval(progressInterval);
                if (statusInterval !== null) {
                    window.clearInterval(statusInterval);
                }

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
        restoreNavigationPath();
        renderAll();
        window.addEventListener('pagehide', saveNavigationPath);

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

        function setFilterOpen(open, focusInput) {
            if (!filterWrap) return;
            if (focusInput === undefined) focusInput = true;
            filterWrap.classList.toggle('is-collapsed', !open);
            if (toggleFilterBtn) {
                toggleFilterBtn.classList.toggle('active', open);
                toggleFilterBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            try {
                localStorage.setItem(FILTER_OPEN_KEY, open ? '1' : '0');
            } catch (err) { /* ignore */ }
            if (open && focusInput && filterInput) {
                window.setTimeout(function () { filterInput.focus(); }, 0);
            }
        }

        function clearFilterValue() {
            if (!filterInput) return;
            filterInput.value = '';
            try {
                localStorage.removeItem(FILTER_VALUE_KEY);
            } catch (err) { /* ignore */ }
            applyFilter('');
            if (clearFilterBtn) clearFilterBtn.style.display = 'none';
        }

        if (filterInput) {
            var storedFilterValue = '';
            var storedFilterOpen = false;
            try {
                storedFilterValue = localStorage.getItem(FILTER_VALUE_KEY) || '';
                storedFilterOpen = localStorage.getItem(FILTER_OPEN_KEY) === '1';
            } catch (err) { /* ignore */ }

            if (storedFilterValue) {
                filterInput.value = storedFilterValue;
            }

            var initialTerm = filterInput.value.trim();
            if (initialTerm || storedFilterOpen) {
                setFilterOpen(true, false);
            }
            if (initialTerm) {
                applyFilter(initialTerm);
                if (clearFilterBtn) clearFilterBtn.style.display = 'flex';
            }
        }

        if (toggleFilterBtn && filterWrap) {
            toggleFilterBtn.addEventListener('click', function (e) {
                e.preventDefault();
                toggleFilterBtn.blur();
                var isOpen = !filterWrap.classList.contains('is-collapsed');
                if (isOpen && filterInput && filterInput.value.trim()) {
                    clearFilterValue();
                    setFilterOpen(false, false);
                    return;
                }
                setFilterOpen(!isOpen);
            });
        }

        if (filterInput) {
            filterInput.addEventListener('input', function () {
                var term = this.value.trim();
                try {
                    localStorage.setItem(FILTER_VALUE_KEY, this.value);
                } catch (err) { /* ignore */ }
                applyFilter(term);
                if (clearFilterBtn) clearFilterBtn.style.display = term ? 'flex' : 'none';
            });
        }

        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function () {
                clearFilterValue();
                if (filterInput) filterInput.focus();
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
        });
    });
})();
