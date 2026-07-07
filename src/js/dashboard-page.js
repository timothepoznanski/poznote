(function () {
    'use strict';

    // Sync favorites preference (localStorage → URL) before the page renders.
    // Only redirects if localStorage has an explicit saved value that differs from the URL.
    var FAVORITES_KEY = 'dashboard_favorites';
    var FILTER_VALUE_KEY = 'dashboard_filter_value';
    var NAV_PATH_KEY = 'dashboard_nav_path';
    var SYNC_RESULT_SCROLL_KEY = 'dashboard_git_sync_result_scroll_top';
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

        var iconHtml = '';
        if (note.icon) {
            if (note.icon.indexOf('lucide') !== -1) {
                var iconStyle = note.iconColor ? ' style="color:' + esc(note.iconColor) + ' !important"' : '';
                iconHtml = '<i class="' + esc(note.icon) + ' dash-note-icon"' + iconStyle + '></i>';
            } else {
                iconHtml = '<span class="dash-note-icon dash-note-icon-emoji">' + esc(note.icon) + '</span>';
            }
        }

        // Named target: reuses the same Poznote notes tab if already open
        // (instead of spawning a new tab per click or replacing the dashboard).
        // In standalone PWA mode a named target would escape the app window,
        // so navigate in place instead.
        var linkTarget = shouldReuseCurrentPwaWindow(note.url) ? '' : ' target="poznote-notes"';

        return '<div class="dash-card dash-note-card" data-note-id="' + note.id + '" data-search="' + esc(searchVal) + '" title="' + esc(tooltip) + '">' +
            '<a class="dash-card-link" href="' + esc(note.url) + '"' + linkTarget + '>' +
                '<div class="dash-card-note-title">' + iconHtml + esc(note.heading) + '</div>' +
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

    function openWorkspaceSwitcher() {
        var modal = document.getElementById('workspaceSwitcherModal');
        if (!modal) return;
        modal.style.display = 'flex';
        loadWorkspaces();
    }

    function closeWorkspaceSwitcher() {
        var modal = document.getElementById('workspaceSwitcherModal');
        if (modal) modal.style.display = 'none';
    }

    function loadWorkspaces() {
        var list = document.getElementById('workspaceSwitcherList');
        if (!list) return;
        list.innerHTML = '<div class="workspace-switcher-loading">Loading...</div>';

        var currentWs = document.body.getAttribute('data-workspace') || '';

        fetch('api/v1/workspaces', { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                if (!data.success || !Array.isArray(data.workspaces)) {
                    list.innerHTML = '<div class="workspace-switcher-loading">No workspaces found</div>';
                    return;
                }
                var html = '';
                data.workspaces.forEach(function (ws) {
                    var isCurrent = ws.name === currentWs;
                    html += '<button type="button" class="workspace-switcher-item' + (isCurrent ? ' is-current' : '') + '"'
                        + ' data-workspace="' + ws.name.replace(/"/g, '&quot;') + '"'
                        + (isCurrent ? ' disabled' : '')
                        + '>'
                        + '<i class="lucide ' + (isCurrent ? 'lucide-check' : 'lucide-layers') + '"></i>'
                        + ws.name
                        + '</button>';
                });
                if (!data.workspaces.length) {
                    html = '<div class="workspace-switcher-loading">No workspaces available</div>';
                }
                list.innerHTML = html;

                Array.prototype.forEach.call(list.querySelectorAll('.workspace-switcher-item:not(.is-current)'), function (btn) {
                    btn.addEventListener('click', function () {
                        var ws = btn.getAttribute('data-workspace');
                        if (ws) {
                            window.location.href = 'dashboard.php?workspace=' + encodeURIComponent(ws);
                        }
                    });
                });
            })
            .catch(function () {
                list.innerHTML = '<div class="workspace-switcher-loading">Failed to load workspaces</div>';
            });
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

    function markDashboardGitSyncResultReload() {
        try {
            sessionStorage.setItem(SYNC_RESULT_SCROLL_KEY, '1');
        } catch (e) { /* ignore */ }

        try {
            if ('scrollRestoration' in window.history) {
                window.history.scrollRestoration = 'manual';
            }
        } catch (e) { /* ignore */ }
    }

    function restoreDashboardGitSyncResultPosition() {
        var shouldScroll = false;
        try {
            shouldScroll = sessionStorage.getItem(SYNC_RESULT_SCROLL_KEY) === '1';
            if (shouldScroll) {
                sessionStorage.removeItem(SYNC_RESULT_SCROLL_KEY);
            }
        } catch (e) { /* ignore */ }

        if (!shouldScroll) return;

        try {
            if ('scrollRestoration' in window.history) {
                window.history.scrollRestoration = 'manual';
            }
        } catch (e) { /* ignore */ }

        function scrollTop() {
            window.scrollTo(0, 0);
            if (document.documentElement) document.documentElement.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;
        }

        scrollTop();
        window.requestAnimationFrame(scrollTop);
        window.setTimeout(scrollTop, 120);
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
                markDashboardGitSyncResultReload();
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
            body: JSON.stringify({ async: true })
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
                        markDashboardGitSyncResultReload();
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
        var title = action === 'pull' ? 'Pull' : 'Push';
        var confirmMsg = action === 'pull' ? gitTxt.confirmPull : gitTxt.confirmPush;

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
        restoreDashboardGitSyncResultPosition();
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
            try {
                storedFilterValue = localStorage.getItem(FILTER_VALUE_KEY) || '';
            } catch (err) { /* ignore */ }

            if (storedFilterValue) {
                filterInput.value = storedFilterValue;
            }

            var initialTerm = filterInput.value.trim();
            if (initialTerm) {
                applyFilter(initialTerm);
                if (clearFilterBtn) clearFilterBtn.style.display = 'flex';
            }
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

        Array.prototype.forEach.call(document.querySelectorAll('[data-dashboard-git-action]'), function (actionBtn) {
            actionBtn.addEventListener('click', function () {
                handleDashboardGitAction(actionBtn);
            });
        });

        var wsModal = document.getElementById('workspaceSwitcherModal');
        Array.prototype.forEach.call(document.querySelectorAll('[data-action="open-workspace-switcher-modal"]'), function (trigger) {
            trigger.addEventListener('click', function (e) {
                e.preventDefault();
                openWorkspaceSwitcher();
            });
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-action="close-workspace-switcher-modal"]'), function (closeBtn) {
            closeBtn.addEventListener('click', closeWorkspaceSwitcher);
        });
        if (wsModal) {
            wsModal.addEventListener('click', function (e) {
                if (e.target === wsModal) closeWorkspaceSwitcher();
            });
        }

        var userInfoTrigger = document.querySelector('[data-action="open-user-info-modal"]');
        var userInfoModal = document.getElementById('dashboardUserInfoModal');
        if (userInfoTrigger) {
            userInfoTrigger.addEventListener('click', function (e) {
                e.preventDefault();
                var isAdmin = window.DASHBOARD_USER && window.DASHBOARD_USER.isAdmin;
                if (isAdmin) {
                    window.location.href = 'admin/users.php';
                } else if (userInfoModal) {
                    userInfoModal.style.display = 'flex';
                }
            });
        }
        Array.prototype.forEach.call(document.querySelectorAll('[data-action="close-dashboard-user-info-modal"]'), function (closeBtn) {
            closeBtn.addEventListener('click', function () {
                if (userInfoModal) userInfoModal.style.display = 'none';
            });
        });
        if (userInfoModal) {
            userInfoModal.addEventListener('click', function (e) {
                if (e.target === userInfoModal) userInfoModal.style.display = 'none';
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
