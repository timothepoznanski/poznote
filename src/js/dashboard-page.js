(function () {
    'use strict';

    // Sync favorites preference (localStorage → URL) before the page renders.
    // Only redirects if localStorage has an explicit saved value that differs from the URL.
    var FAVORITES_KEY = 'dashboard_favorites';
    var FILTER_VALUE_KEY = 'dashboard_filter_value';
    var NAV_PATH_KEY = 'dashboard_nav_path';
    var COLOR_FILTER_KEY = 'dashboard_color_filter';
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
        // Same --note-color mechanism as note cards (see buildNoteCard).
        var colorAttrs = '';
        if (folder.cardColorHex) {
            colorAttrs = ' data-color="' + esc(folder.cardColor || '') + '"' +
                ' style="--note-color:' + esc(folder.cardColorHex) + '"';
        }

        // The card itself is a <button>, so the pin control is a span with a
        // button role: nesting real buttons is invalid HTML. The delegated
        // click handler catches it via .dash-card-pin before the folder
        // navigation runs.
        var pinTxt = window.DASHBOARD_PIN_TXT || {};
        var pinLabel = folder.pinned ? (pinTxt.unpin || 'Unpin') : (pinTxt.pin || 'Pin to top');
        var pinBtn = '<span class="dash-card-pin" role="button" tabindex="0"' +
            ' data-pin-folder-id="' + esc(String(folder.id)) + '"' +
            ' aria-pressed="' + (folder.pinned ? 'true' : 'false') + '"' +
            ' title="' + esc(pinLabel) + '" aria-label="' + esc(pinLabel) + '">' +
            '<i class="lucide lucide-pin"></i></span>';

        return '<button class="dash-card dash-folder-card' + (folder.cardColorHex ? ' has-note-color' : '') +
            (folder.pinned ? ' is-pinned' : '') + '"' +
            ' data-type="folder" data-folder-index="' + index + '"' +
            ' data-folder-id="' + esc(String(folder.id)) + '" data-search="' + esc(search) + '"' + colorAttrs + '>' +
            pinBtn +
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
            // The preview keeps the note's line breaks; render them as <br>
            content = '<div class="board-card-excerpt">' + esc(note.text).replace(/\n/g, '<br>') + '</div>';
        }

        // First image of the note as a thumbnail next to the excerpt
        if (note.image) {
            content = '<div class="dash-card-body">' + content +
                '<div class="dash-card-thumb"><img src="' + esc(note.image) + '" alt="" loading="lazy" decoding="async"></div>' +
            '</div>';
        }

        var footer = '';
        if (tags.length > 0 || note.updated) {
            footer = '<div class="board-card-footer">';
            tags.slice(0, 3).forEach(function (tag) {
                var tagHex = resolveDashboardTagColorHex(tag);
                if (tagHex) {
                    footer += '<span class="board-card-tag board-card-tag-colored" style="--tag-color:' + esc(tagHex) + '">' + esc(tag) + '</span>';
                } else {
                    footer += '<span class="board-card-tag">' + esc(tag) + '</span>';
                }
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

        // Always navigate in place: on desktop widths, index.php's internal
        // tab bar (tabs.js) handles newtab=1 itself and adds an in-app tab.
        // On narrow/mobile widths (browser or PWA) there is no internal tab
        // bar, but a named target would still spawn a new browser tab on
        // first click, so navigating in place keeps everything in one tab.
        var linkTarget = '';

        // The tint is driven entirely by --note-color; dashboard.css derives the
        // background and border from it with color-mix(), separately for light
        // and dark mode, so any custom hex works without extra rules.
        var colorAttrs = '';
        if (note.colorHex) {
            colorAttrs = ' data-color="' + esc(note.color || '') + '"' +
                ' style="--note-color:' + esc(note.colorHex) + '"';
        }

        // The pin button sits outside .dash-card-link so clicking it never
        // navigates to the note.
        var pinTxt = window.DASHBOARD_PIN_TXT || {};
        var pinLabel = note.pinned ? (pinTxt.unpin || 'Unpin') : (pinTxt.pin || 'Pin to top');
        var pinBtn = '<button type="button" class="dash-card-pin" data-pin-note-id="' + note.id + '"' +
            ' aria-pressed="' + (note.pinned ? 'true' : 'false') + '"' +
            ' title="' + esc(pinLabel) + '" aria-label="' + esc(pinLabel) + '">' +
            '<i class="lucide lucide-pin"></i></button>';

        return '<div class="dash-card dash-note-card' + (note.colorHex ? ' has-note-color' : '') +
            (note.pinned ? ' is-pinned' : '') + '"' +
            ' data-note-id="' + note.id + '" data-search="' + esc(searchVal) + '" title="' + esc(tooltip) + '"' + colorAttrs + '>' +
            pinBtn +
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
        var sectioned = false;
        // A text term or a color filter both search the whole tree rather than
        // the current folder, so results are never hidden behind navigation.
        if (activeFilterTerm || activeColorFilter) {
            // Folders carry colors too, so a pure color filter lists the
            // matching folders alongside the matching notes. A text term still
            // searches notes only, as before.
            var matchingFolders = [];
            if (activeColorFilter && !activeFilterTerm) {
                collectFolders(rootData, matchingFolders);
                matchingFolders = matchingFolders.filter(folderMatchesColor);
            }

            // Cards here come from all over the tree, so rank them globally:
            // baseOrder is only meaningful among siblings.
            var matchingNotes = sortPinnedFirst(getAllNotes().filter(function (note) {
                if (activeFilterTerm && !noteMatchesSearch(note, activeFilterTerm)) return false;
                return noteMatchesColor(note);
            }), 'globalOrder');

            matchingFolders.forEach(function (folder) {
                html += buildFolderCard(folder, findFolderIndexInParent(folder));
            });
            matchingNotes.forEach(function (note) { html += buildNoteCard(note); });
            setNoResultsVisible(matchingFolders.length === 0 && matchingNotes.length === 0);
        } else {
            // Pinned folders and notes get their own section at the top;
            // everything else (folders, then unpinned notes) goes below an
            // "Others" heading. Folders are partitioned at render time only,
            // so level.folders keeps its order and the positional
            // data-folder-index stays valid.
            var pinnedNotes = [], otherNotes = [];
            level.notes.forEach(function (note) {
                (note.pinned ? pinnedNotes : otherNotes).push(note);
            });
            var pinnedFolders = [], otherFolders = [];
            level.folders.forEach(function (folder, i) {
                (folder.pinned ? pinnedFolders : otherFolders).push({ folder: folder, index: i });
            });

            var pinnedCount = pinnedFolders.length + pinnedNotes.length;
            if (pinnedCount > 0 && (otherFolders.length > 0 || otherNotes.length > 0)) {
                sectioned = true;
                var pinnedHtml = '', restHtml = '';
                pinnedFolders.forEach(function (entry) { pinnedHtml += buildFolderCard(entry.folder, entry.index); });
                pinnedNotes.forEach(function (note) { pinnedHtml += buildNoteCard(note); });
                otherFolders.forEach(function (entry) { restHtml += buildFolderCard(entry.folder, entry.index); });
                otherNotes.forEach(function (note) { restHtml += buildNoteCard(note); });

                var othersTitle = (window.DASHBOARD_PIN_TXT && window.DASHBOARD_PIN_TXT.others) || 'Others';
                html = '<div class="dashboard-grid-container dash-grid-section">' + pinnedHtml + '</div>' +
                    '<div class="dash-section-title">' + esc(othersTitle) + '</div>' +
                    '<div class="dashboard-grid-container dash-grid-section">' + restHtml + '</div>';
            } else {
                level.folders.forEach(function (folder, i) { html += buildFolderCard(folder, i); });
                level.notes.forEach(function (note)         { html += buildNoteCard(note); });
            }
            setNoResultsVisible(false);
        }
        grid.classList.toggle('dash-grid-sectioned', sectioned);
        grid.innerHTML = html;
    }

    function renderBreadcrumb() {
        var bc = document.getElementById('dashboardBreadcrumb');
        if (!bc) return;

        if (activeFilterTerm || activeColorFilter || navStack.length === 0) {
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

    // Navigate by id: in a filtered view the cards come from anywhere in the
    // tree, so the positional index above no longer identifies a folder.
    // Rebuilds the whole ancestor chain so the breadcrumb stays correct.
    function buildFolderPath(folderId, level, trail) {
        var node = level || rootData;
        var folders = node.folders || [];
        for (var i = 0; i < folders.length; i++) {
            var next = (trail || []).concat([folders[i]]);
            if (String(folders[i].id) === String(folderId)) return next;
            var found = buildFolderPath(folderId, folders[i], next);
            if (found) return found;
        }
        return null;
    }

    function navigateIntoById(folderId) {
        var path = buildFolderPath(folderId);
        if (!path) return false;
        // Entering a folder from a filtered view drops the color filter,
        // otherwise the folder would open onto a filtered subset.
        if (activeColorFilter) {
            activeColorFilter = null;
            saveColorFilter();
            updateColorFilterButtonState();
        }
        navStack = path;
        saveNavigationPath();
        renderAll();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
    }

    function collectFolders(level, out) {
        (level.folders || []).forEach(function (folder) {
            out.push(folder);
            collectFolders(folder, out);
        });
    }

    // Position of a folder within its own parent, for the index-based path.
    function findFolderIndexInParent(folder) {
        var path = buildFolderPath(folder.id);
        if (!path) return 0;
        var parent = path.length > 1 ? path[path.length - 2] : rootData;
        var siblings = parent.folders || [];
        for (var i = 0; i < siblings.length; i++) {
            if (String(siblings[i].id) === String(folder.id)) return i;
        }
        return 0;
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

    // --- Note color picker ---
    //
    // Opened by right-clicking a note card. The chosen value is either a
    // palette id or a custom '#rrggbb'; both go to PUT /notes/{id}/color, and
    // the in-memory note is patched so the grid re-renders with the new tint
    // without a page reload.

    var colorTargetNoteId = null;
    var colorTargetType = 'note';   // 'note' | 'folder'
    var colorPendingValue = null;   // palette id, '#rrggbb', or '' to clear
    // Active color filter: null = off, a palette id, a custom hex, or
    // '__any__' / '__none__'. Persisted per workspace so the board comes back
    // filtered the way it was left.
    var activeColorFilter = null;

    function saveColorFilter() {
        try {
            var key = dashboardStorageKey(COLOR_FILTER_KEY);
            if (activeColorFilter) {
                localStorage.setItem(key, activeColorFilter);
            } else {
                localStorage.removeItem(key);
            }
        } catch (e) { /* localStorage unavailable */ }
    }

    function restoreColorFilter() {
        try {
            activeColorFilter = localStorage.getItem(dashboardStorageKey(COLOR_FILTER_KEY)) || null;
        } catch (e) {
            activeColorFilter = null;
        }
        updateColorFilterButtonState();
    }

    function noteMatchesColor(note) {
        if (!activeColorFilter) return true;
        if (activeColorFilter === '__any__')  return !!note.colorHex;
        if (activeColorFilter === '__none__') return !note.colorHex;
        return note.color === activeColorFilter;
    }

    // Folders keep their card color under cardColor/cardColorHex, because
    // 'color' already means the folder icon color.
    function folderMatchesColor(folder) {
        if (!activeColorFilter) return true;
        if (activeColorFilter === '__any__')  return !!folder.cardColorHex;
        // '__none__' would list every uncolored folder, which is just noise.
        if (activeColorFilter === '__none__') return false;
        return folder.cardColor === activeColorFilter;
    }

    function getPalette() {
        return Array.isArray(window.NOTE_COLOR_PALETTE) ? window.NOTE_COLOR_PALETTE : [];
    }

    // Tag colors share the note color semantics: window.TAG_COLORS maps a
    // lowercased tag name to a palette id or a literal '#rrggbb'.
    function resolveDashboardTagColorHex(tag) {
        var map = window.TAG_COLORS;
        if (!map || typeof map !== 'object') return '';
        var value = map[String(tag || '').trim().toLowerCase()];
        if (typeof value !== 'string' || value === '') return '';
        if (value.charAt(0) === '#') return value;
        var palette = getPalette();
        for (var i = 0; i < palette.length; i++) {
            if (palette[i].id === value.toLowerCase()) return palette[i].hex;
        }
        return '';
    }

    function findNoteById(noteId) {
        var notes = getAllNotes();
        for (var i = 0; i < notes.length; i++) {
            if (String(notes[i].id) === String(noteId)) return notes[i];
        }
        return null;
    }

    // --- Pinning ---
    //
    // Pinned notes sort ahead of the rest inside their own folder. The server
    // already delivers them in that order; this re-sorts in place after a
    // toggle so the card moves without a page reload.

    // Rank each note by its position in the server's updated-DESC order, once,
    // before any pinning reorders the arrays. Without this, unpinning could only
    // restore the order the array happened to be in, not the original one.
    // Both ranks come from the server (see dashboardBuildNoteData in
    // dashboard.php) and describe the updated-DESC order with pinning ignored:
    // baseOrder within a note's own folder, globalOrder across the whole tree.
    // Sorting on them means unpinning restores the original position rather
    // than whatever order the array was left in.

    // Same grouping as dashboardSortPinnedFirst() in dashboard.php: pinned
    // first, each group falling back to the original updated-DESC order.
    function sortPinnedFirst(notes, orderKey) {
        var key = orderKey || 'baseOrder';
        return (notes || []).slice().sort(function (a, b) {
            var pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
            if (pinDiff !== 0) return pinDiff;
            return (a[key] || 0) - (b[key] || 0);
        });
    }

    function resortLevel(level) {
        var node = level || rootData;
        node.notes = sortPinnedFirst(node.notes);
        (node.folders || []).forEach(resortLevel);
    }

    function toggleNotePinned(noteId) {
        var note = findNoteById(noteId);
        if (!note) return;

        var nextPinned = !note.pinned;
        fetch('api/v1/notes/' + encodeURIComponent(noteId) + '/pinned', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ pinned: nextPinned })
        }).then(function (response) {
            if (!response.ok) throw new Error('pin update failed');
            return response.json();
        }).then(function (data) {
            note.pinned = data && typeof data.pinned === 'boolean' ? data.pinned : nextPinned;
            resortLevel(rootData);
            renderAll();
        }).catch(function () {
            var message = (window.DASHBOARD_PIN_TXT && window.DASHBOARD_PIN_TXT.error) ||
                'Could not update the pinned state.';
            if (typeof window.showNotificationPopup === 'function') {
                window.showNotificationPopup(message, 'error');
            } else {
                alert(message);
            }
        });
    }

    function toggleFolderPinned(folderId) {
        var folder = findFolderById(folderId);
        if (!folder) return;

        var nextPinned = !folder.pinned;
        fetch('api/v1/folders/' + encodeURIComponent(folderId) + '/pinned', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ pinned: nextPinned })
        }).then(function (response) {
            if (!response.ok) throw new Error('pin update failed');
            return response.json();
        }).then(function (data) {
            folder.pinned = data && typeof data.pinned === 'boolean' ? data.pinned : nextPinned;
            renderAll();
        }).catch(function () {
            var message = (window.DASHBOARD_PIN_TXT && window.DASHBOARD_PIN_TXT.error) ||
                'Could not update the pinned state.';
            if (typeof window.showNotificationPopup === 'function') {
                window.showNotificationPopup(message, 'error');
            } else {
                alert(message);
            }
        });
    }

    // Depth-first search over the whole tree: the picker may be opened on a
    // folder that is not in the level currently displayed.
    function findFolderById(folderId, level) {
        var node = level || rootData;
        var folders = node.folders || [];
        for (var i = 0; i < folders.length; i++) {
            if (String(folders[i].id) === String(folderId)) return folders[i];
            var found = findFolderById(folderId, folders[i]);
            if (found) return found;
        }
        return null;
    }

    // The object the picker is currently editing, note or folder.
    function currentColorTarget() {
        if (colorTargetNoteId === null) return null;
        return colorTargetType === 'folder'
            ? findFolderById(colorTargetNoteId)
            : findNoteById(colorTargetNoteId);
    }

    function markSelectedSwatch() {
        var grid = document.getElementById('noteColorGrid');
        if (!grid) return;
        Array.prototype.forEach.call(grid.querySelectorAll('.note-color-option'), function (option) {
            var isSelected = option.getAttribute('data-color-value') === colorPendingValue;
            option.classList.toggle('selected', isSelected);
            option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        });
    }

    function buildColorGrid() {
        var grid = document.getElementById('noteColorGrid');
        if (!grid) return;
        grid.innerHTML = '';

        getPalette().forEach(function (entry) {
            var option = document.createElement('button');
            option.type = 'button';
            option.className = 'note-color-option';
            option.setAttribute('role', 'radio');
            option.setAttribute('data-color-value', entry.id);
            option.title = entry.name;
            option.setAttribute('aria-label', entry.name);
            option.innerHTML = '<span class="note-color-swatch" style="background-color:' + esc(entry.hex) + '"></span>' +
                '<span class="note-color-name">' + esc(entry.name) + '</span>';
            option.addEventListener('click', function () {
                colorPendingValue = entry.id;
                markSelectedSwatch();
            });
            grid.appendChild(option);
        });
    }

    function openNoteColorModal(targetId, targetType) {
        var modal = document.getElementById('noteColorModal');
        if (!modal) return;

        var isFolder = targetType === 'folder';
        var target = isFolder ? findFolderById(targetId) : findNoteById(targetId);
        if (!target) return;

        colorTargetNoteId = targetId;
        colorTargetType = isFolder ? 'folder' : 'note';
        colorPendingValue = (isFolder ? target.cardColor : target.color) || '';

        var txt = window.NOTE_COLOR_TXT || {};
        var headingEl = document.getElementById('noteColorModalTitle');
        if (headingEl) {
            headingEl.textContent = isFolder
                ? (txt.folderModalTitle || 'Folder color')
                : (txt.modalTitle || 'Note color');
        }

        var titleEl = document.getElementById('noteColorModalNoteTitle');
        if (titleEl) titleEl.textContent = (isFolder ? target.name : target.heading) || '';

        buildColorGrid();
        markSelectedSwatch();

        modal.style.display = 'flex';
    }

    function closeNoteColorModal() {
        var modal = document.getElementById('noteColorModal');
        if (modal) modal.style.display = 'none';
        colorTargetNoteId = null;
        colorPendingValue = null;
    }

    function applyNoteColor(value) {
        if (colorTargetNoteId === null) return;
        var targetId = colorTargetNoteId;
        var isFolder = colorTargetType === 'folder';
        var endpoint = (isFolder ? 'api/v1/folders/' : 'api/v1/notes/') +
            encodeURIComponent(targetId) + '/color';

        fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ color: value })
        }).then(function (response) {
            if (!response.ok) throw new Error('color update failed');
            return response.json();
        }).then(function (data) {
            var target = isFolder ? findFolderById(targetId) : findNoteById(targetId);
            if (target && isFolder) {
                target.cardColor = (data && data.color) || '';
                target.cardColorHex = (data && data.color_hex) || '';
            } else if (target) {
                target.color = (data && data.color) || '';
                target.colorHex = (data && data.color_hex) || '';
            }
            closeNoteColorModal();
            renderAll();
        }).catch(function () {
            var message = (window.NOTE_COLOR_TXT && window.NOTE_COLOR_TXT.applyError) || 'Could not update the note color.';
            if (typeof window.showNotificationPopup === 'function') {
                window.showNotificationPopup(message, 'error');
            } else {
                alert(message);
            }
        });
    }

    function buildColorFilterMenu() {
        var menu = document.getElementById('dashboardColorFilterMenu');
        if (!menu) return;
        menu.innerHTML = '';

        var txt = window.NOTE_COLOR_TXT || {};
        var entries = [
            { value: null, label: txt.filterAll || 'All notes', hex: null },
            { value: '__any__', label: txt.filterAnyColor || 'Any color', hex: null },
            { value: '__none__', label: txt.filterNoColor || 'No color', hex: null }
        ].concat(getPalette().map(function (entry) {
            return { value: entry.id, label: entry.name, hex: entry.hex };
        }));

        // Custom per-note colors belong to no palette entry, so they would
        // otherwise be unfilterable. List every custom hex actually in use,
        // sorted so the menu order stays stable between openings.
        var customHexes = {};
        getAllNotes().forEach(function (note) {
            if (note.color && String(note.color).charAt(0) === '#') {
                customHexes[note.color] = true;
            }
        });
        Object.keys(customHexes).sort().forEach(function (hex) {
            entries.push({ value: hex, label: hex, hex: hex });
        });

        entries.forEach(function (entry) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'dashboard-color-filter-item' +
                (activeColorFilter === entry.value ? ' active' : '');
            item.innerHTML = (entry.hex
                    ? '<span class="note-color-swatch" style="background-color:' + esc(entry.hex) + '"></span>'
                    : '<span class="note-color-swatch note-color-swatch-empty"></span>') +
                '<span>' + esc(entry.label) + '</span>';
            item.addEventListener('click', function () {
                activeColorFilter = entry.value;
                saveColorFilter();
                closeColorFilterMenu();
                updateColorFilterButtonState();
                renderAll();
            });
            menu.appendChild(item);
        });
    }

    // The menu is position:fixed (the topbar clips absolute children), so it is
    // anchored to the button here and kept inside the viewport.
    function positionColorFilterMenu() {
        var btn = document.getElementById('dashboardColorFilterBtn');
        var menu = document.getElementById('dashboardColorFilterMenu');
        if (!btn || !menu || menu.hidden) return;

        var rect = btn.getBoundingClientRect();
        var top = rect.bottom + 6;
        menu.style.top = top + 'px';
        // Cap to the space actually left below the button so every entry stays
        // reachable by scrolling instead of being cut off by the viewport.
        menu.style.maxHeight = Math.max(160, window.innerHeight - top - 12) + 'px';

        var width = menu.offsetWidth || 180;
        var left = Math.min(rect.left, window.innerWidth - width - 8);
        menu.style.left = Math.max(8, left) + 'px';
    }

    function updateColorFilterButtonState() {
        var btn = document.getElementById('dashboardColorFilterBtn');
        if (btn) btn.classList.toggle('active', !!activeColorFilter);
    }

    function closeColorFilterMenu() {
        var menu = document.getElementById('dashboardColorFilterMenu');
        var btn = document.getElementById('dashboardColorFilterBtn');
        if (menu) menu.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function initColorFilter() {
        var btn = document.getElementById('dashboardColorFilterBtn');
        var menu = document.getElementById('dashboardColorFilterMenu');
        if (!btn || !menu) return;

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (menu.hidden) {
                buildColorFilterMenu();
                menu.hidden = false;
                positionColorFilterMenu();
                btn.setAttribute('aria-expanded', 'true');
            } else {
                closeColorFilterMenu();
            }
        });

        document.addEventListener('click', function (e) {
            if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) {
                closeColorFilterMenu();
            }
        });

        window.addEventListener('resize', positionColorFilterMenu);
        window.addEventListener('scroll', positionColorFilterMenu, true);
    }

    function initNoteColorPicker() {
        // Right-click anywhere on a note or folder card opens the picker.
        document.addEventListener('contextmenu', function (e) {
            if (!e.target.closest) return;
            // The pin button keeps the browser's own menu rather than the picker.
            if (e.target.closest('.dash-card-pin')) return;

            var noteCard = e.target.closest('.dash-note-card');
            if (noteCard) {
                e.preventDefault();
                openNoteColorModal(noteCard.getAttribute('data-note-id'), 'note');
                return;
            }

            var folderCard = e.target.closest('.dash-folder-card');
            if (folderCard) {
                e.preventDefault();
                openNoteColorModal(folderCard.getAttribute('data-folder-id'), 'folder');
            }
        });

        var applyBtn = document.getElementById('noteColorApplyBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function () {
                applyNoteColor(colorPendingValue || '');
            });
        }

        var clearBtn = document.getElementById('noteColorClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () { applyNoteColor(''); });
        }

        Array.prototype.forEach.call(
            document.querySelectorAll('[data-action="close-note-color-modal"]'),
            function (btn) { btn.addEventListener('click', closeNoteColorModal); }
        );

        var modal = document.getElementById('noteColorModal');
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeNoteColorModal();
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && colorTargetNoteId !== null) closeNoteColorModal();
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
        // Restore before the first render so the board comes up already filtered.
        restoreColorFilter();
        renderAll();
        restoreDashboardGitSyncResultPosition();
        initNoteColorPicker();
        initColorFilter();
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
            // Checked first: the pin button sits inside a card, so letting the
            // event fall through would also open the note.
            var pinBtn = e.target.closest('.dash-card-pin');
            if (pinBtn) {
                e.preventDefault();
                e.stopPropagation();
                var pinFolderId = pinBtn.getAttribute('data-pin-folder-id');
                if (pinFolderId !== null) {
                    toggleFolderPinned(pinFolderId);
                } else {
                    toggleNotePinned(pinBtn.getAttribute('data-pin-note-id'));
                }
                return;
            }

            var bcBtn = e.target.closest('.bc-home, .bc-item');
            if (bcBtn) {
                var depth = parseInt(bcBtn.getAttribute('data-depth') || '0', 10);
                navigateTo(depth);
                return;
            }

            var folderCard = e.target.closest('.dash-folder-card');
            if (folderCard) {
                // Prefer the id: in a color-filtered view the cards come from
                // anywhere in the tree, so the positional index is meaningless.
                var folderId = folderCard.getAttribute('data-folder-id');
                if (folderId && navigateIntoById(folderId)) return;
                var idx = parseInt(folderCard.getAttribute('data-folder-index') || '0', 10);
                navigateInto(idx);
                return;
            }
        });

        // The folder pin is a span with role="button" (a real button cannot
        // nest inside the folder card's <button>), so Enter/Space do not fire
        // a click natively.
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var pinBtn = e.target.closest ? e.target.closest('.dash-card-pin[data-pin-folder-id]') : null;
            if (!pinBtn) return;
            e.preventDefault();
            e.stopPropagation();
            toggleFolderPinned(pinBtn.getAttribute('data-pin-folder-id'));
        });
    });
})();

// Mobile scroll hint on the topbar icons row: show a chevron on the right
// edge while more icons are hidden past the viewport
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var wrap = document.querySelector('.dashboard-topbar-scroll');
        if (!wrap) return;
        var nav = wrap.querySelector('.dashboard-topbar-actions');
        if (!nav) return;

        function update() {
            var canScroll = nav.scrollWidth > nav.clientWidth + 2;
            var atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2;
            wrap.classList.toggle('has-scroll-right', canScroll && !atEnd);
        }

        nav.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        update();
    });
})();
