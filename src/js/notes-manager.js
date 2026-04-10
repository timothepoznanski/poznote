(function () {
    'use strict';

    // ── Config ──────────────────────────────────────────────────────────────
    var body = document.body;
    var cfg = {
        workspace:      body.getAttribute('data-workspace') || '',
        txtError:       body.getAttribute('data-txt-error') || 'Error',
        txtUntitled:    body.getAttribute('data-txt-untitled') || 'Untitled',
        txtNoFolder:    body.getAttribute('data-txt-no-folder') || 'No folder',
        txtSelected:    body.getAttribute('data-txt-selected') || 'selected',
        txtSelectAll:   body.getAttribute('data-txt-select-all') || 'Select all visible',
        txtDeselectAll: body.getAttribute('data-txt-deselect-all') || 'Deselect all',
        txtMoveTo:      body.getAttribute('data-txt-move-to') || 'Move to...',
        txtMoving:      body.getAttribute('data-txt-moving') || 'Moving...',
        txtMoved:       body.getAttribute('data-txt-moved') || 'Moved successfully',
        txtRoot:        body.getAttribute('data-txt-root') || 'Root (no folder)',
    };

    // ── State ────────────────────────────────────────────────────────────────
    var allNotes = [];      // [{id, heading, folder, folder_id, updated, workspace, tags}, …]
    var allFolders = [];    // [{id, name, parent_id, path}, …]
    var filteredNotes = []; // Currently visible notes after filter
    var selectedIds = new Set();
    var filterText = '';
    var movingToFolderId = null; // null = root; number = folder id

    // ── DOM refs ─────────────────────────────────────────────────────────────
    var nmSpinner        = document.getElementById('nmSpinner');
    var nmContainer      = document.getElementById('nmNotesContainer');
    var nmEmptyMessage   = document.getElementById('nmEmptyMessage');
    var nmFilterInput    = document.getElementById('nmFilterInput');
    var nmClearFilter    = document.getElementById('nmClearFilter');
    var nmFilterStats    = document.getElementById('nmFilterStats');
    var nmBulkBar        = document.getElementById('nmBulkBar');
    var nmSelectedCount  = document.getElementById('nmSelectedCount');
    var nmSelectAllBtn   = document.getElementById('nmSelectAllBtn');
    var nmDeselectAllBtn = document.getElementById('nmDeselectAllBtn');
    var nmMoveBtn        = document.getElementById('nmMoveBtn');
    var nmMoveModal      = document.getElementById('nmMoveModal');
    var nmFolderSearch   = document.getElementById('nmFolderSearch');
    var nmFolderList     = document.getElementById('nmFolderList');
    var nmConfirmMove    = document.getElementById('nmConfirmMove');
    var nmCancelMove     = document.getElementById('nmCancelMove');

    // ── Helpers ───────────────────────────────────────────────────────────────
    function apiUrl(path) {
        return 'api/v1/' + path;
    }

    function wsParam() {
        return cfg.workspace ? '&workspace=' + encodeURIComponent(cfg.workspace) : '';
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr.replace(' ', 'T') + 'Z');
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString();
    }

    // ── Load data ─────────────────────────────────────────────────────────────
    function loadAll() {
        show(nmSpinner);
        nmContainer.innerHTML = '';
        hide(nmEmptyMessage);

        var notesUrl = apiUrl('notes?trash=0' + wsParam());
        var foldersUrl = apiUrl('folders?hierarchical=false' + wsParam());

        Promise.all([
            fetch(notesUrl).then(r => r.json()),
            fetch(foldersUrl).then(r => r.json())
        ]).then(function (results) {
            var notesData   = results[0];
            var foldersData = results[1];

            if (notesData.error) throw new Error(notesData.error);
            if (foldersData.error) throw new Error(foldersData.error);

            allNotes   = notesData.notes   || [];
            allFolders = foldersData.folders || [];

            hide(nmSpinner);
            applyFilter();
        }).catch(function (err) {
            hide(nmSpinner);
            nmContainer.innerHTML =
                '<div class="error-message">' + cfg.txtError + ': ' + escHtml(err.message) + '</div>';
        });
    }

    // ── Filter ────────────────────────────────────────────────────────────────
    function applyFilter() {
        var q = filterText.toLowerCase();
        if (!q) {
            filteredNotes = allNotes.slice();
        } else {
            filteredNotes = allNotes.filter(function (n) {
                var title = (n.heading || '').toLowerCase();
                var tags  = (n.tags   || '').toLowerCase();
                return title.indexOf(q) !== -1 || tags.indexOf(q) !== -1;
            });
        }

        // Remove selections that are no longer visible
        var visibleIds = new Set(filteredNotes.map(function (n) { return n.id; }));
        selectedIds.forEach(function (id) {
            if (!visibleIds.has(id)) selectedIds.delete(id);
        });

        renderNotes();
        updateFilterStats();
        updateBulkBar();
    }

    function updateFilterStats() {
        if (filterText && filteredNotes.length < allNotes.length) {
            nmFilterStats.textContent = filteredNotes.length + ' / ' + allNotes.length;
            show(nmFilterStats);
        } else {
            hide(nmFilterStats);
        }
    }

    // ── Render notes grouped by folder ───────────────────────────────────────
    function renderNotes() {
        nmContainer.innerHTML = '';

        if (filteredNotes.length === 0) {
            show(nmEmptyMessage);
            return;
        }
        hide(nmEmptyMessage);

        // Group notes by folder_id (null = uncategorised)
        var groups = {}; // folderId/string -> [notes]
        filteredNotes.forEach(function (n) {
            var key = n.folder_id != null ? String(n.folder_id) : '__none__';
            if (!groups[key]) groups[key] = [];
            groups[key].push(n);
        });

        // Build flat folder lookup
        var folderById = {};
        allFolders.forEach(function (f) { folderById[String(f.id)] = f; });

        // Build ordered folder path map for display + sorting
        // Sort groups: folder groups alphabetically by path, then uncategorised last
        var groupKeys = Object.keys(groups).filter(function (k) { return k !== '__none__'; });
        groupKeys.sort(function (a, b) {
            var pa = (folderById[a] && folderById[a].path) || '';
            var pb = (folderById[b] && folderById[b].path) || '';
            return pa.localeCompare(pb, undefined, { sensitivity: 'base' });
        });
        if (groups['__none__']) groupKeys.push('__none__');

        var frag = document.createDocumentFragment();

        groupKeys.forEach(function (key) {
            var notes = groups[key];
            var section = document.createElement('div');
            section.className = 'nm-folder-section';

            // Folder header
            var header = document.createElement('div');
            header.className = 'nm-folder-header';

            var chevron = document.createElement('span');
            chevron.className = 'nm-folder-chevron nm-open';
            chevron.innerHTML = '<i class="lucide lucide-chevron-down"></i>';

            var folderLabel = document.createElement('span');
            folderLabel.className = 'nm-folder-label';

            var groupSelectAll = document.createElement('button');
            groupSelectAll.className = 'nm-group-select-btn';
            groupSelectAll.title = 'Select all in this folder';
            groupSelectAll.innerHTML = '<i class="lucide lucide-check-square"></i>';

            if (key === '__none__') {
                folderLabel.innerHTML = '<i class="lucide lucide-folder-open" style="color: var(--icon-color, #94a3b8);"></i> '
                    + escHtml(cfg.txtNoFolder);
                header.setAttribute('data-folder-id', '');
            } else {
                var f = folderById[key];
                var icon   = (f && f.icon)   ? f.icon   : 'lucide-folder';
                var color  = (f && f.icon_color) ? f.icon_color : '';
                var path   = (f && f.path)   ? f.path   : (f ? f.name : cfg.txtNoFolder);
                var style  = color ? ' style="color:' + escHtml(color) + '"' : '';
                folderLabel.innerHTML = '<i class="lucide ' + escHtml(icon) + '"' + style + '></i> '
                    + escHtml(path);
                header.setAttribute('data-folder-id', key);
            }

            var notesInGroup = notes;
            groupSelectAll.addEventListener('click', function (e) {
                e.stopPropagation();
                var allChecked = notesInGroup.every(function (n) { return selectedIds.has(n.id); });
                notesInGroup.forEach(function (n) {
                    if (allChecked) selectedIds.delete(n.id);
                    else            selectedIds.add(n.id);
                });
                // Sync checkboxes
                section.querySelectorAll('.nm-note-checkbox').forEach(function (cb) {
                    cb.checked = !allChecked;
                });
                updateBulkBar();
            });

            header.appendChild(chevron);
            header.appendChild(folderLabel);
            header.appendChild(groupSelectAll);

            // Note count badge
            var badge = document.createElement('span');
            badge.className = 'nm-folder-count';
            badge.textContent = notes.length;
            header.appendChild(badge);

            // Collapse/expand on click
            var notesList = document.createElement('div');
            notesList.className = 'nm-notes-list';
            header.addEventListener('click', function (e) {
                if (e.target.closest('.nm-group-select-btn') || e.target.closest('input')) return;
                var isOpen = chevron.classList.contains('nm-open');
                if (isOpen) {
                    chevron.classList.remove('nm-open');
                    chevron.innerHTML = '<i class="lucide lucide-chevron-right"></i>';
                    notesList.style.display = 'none';
                } else {
                    chevron.classList.add('nm-open');
                    chevron.innerHTML = '<i class="lucide lucide-chevron-down"></i>';
                    notesList.style.display = '';
                }
            });

            // Notes rows
            notes.forEach(function (note) {
                var row = buildNoteRow(note);
                notesList.appendChild(row);
            });

            section.appendChild(header);
            section.appendChild(notesList);
            frag.appendChild(section);
        });

        nmContainer.appendChild(frag);
    }

    function buildNoteRow(note) {
        var row = document.createElement('div');
        row.className = 'nm-note-row';
        row.setAttribute('data-note-id', note.id);

        // Checkbox
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'nm-note-checkbox';
        cb.checked = selectedIds.has(note.id);
        cb.addEventListener('change', function () {
            if (cb.checked) selectedIds.add(note.id);
            else            selectedIds.delete(note.id);
            updateBulkBar();
        });

        // Note link
        var link = document.createElement('a');
        link.className = 'nm-note-link';
        link.href = 'index.php?note=' + note.id + (cfg.workspace ? '&workspace=' + encodeURIComponent(cfg.workspace) : '');
        link.textContent = note.heading || cfg.txtUntitled;

        // Tags chips
        var tagsEl = document.createElement('span');
        tagsEl.className = 'nm-note-tags';
        if (note.tags) {
            note.tags.split(',').forEach(function (tag) {
                tag = tag.trim();
                if (!tag) return;
                var chip = document.createElement('span');
                chip.className = 'nm-tag-chip';
                chip.textContent = tag;
                tagsEl.appendChild(chip);
            });
        }

        // Meta
        var meta = document.createElement('span');
        meta.className = 'nm-note-meta';
        meta.textContent = formatDate(note.updated);

        row.appendChild(cb);
        row.appendChild(link);
        row.appendChild(tagsEl);
        row.appendChild(meta);
        return row;
    }

    // ── Bulk bar ──────────────────────────────────────────────────────────────
    function updateBulkBar() {
        var count = selectedIds.size;
        if (count > 0) {
            nmBulkBar.classList.remove('nm-bulk-bar-hidden');
            nmSelectedCount.textContent = count + ' ' + cfg.txtSelected;
        } else {
            nmBulkBar.classList.add('nm-bulk-bar-hidden');
        }
    }

    nmSelectAllBtn.addEventListener('click', function () {
        filteredNotes.forEach(function (n) { selectedIds.add(n.id); });
        nmContainer.querySelectorAll('.nm-note-checkbox').forEach(function (cb) { cb.checked = true; });
        updateBulkBar();
    });

    nmDeselectAllBtn.addEventListener('click', function () {
        selectedIds.clear();
        nmContainer.querySelectorAll('.nm-note-checkbox').forEach(function (cb) { cb.checked = false; });
        updateBulkBar();
    });

    // ── Move modal ────────────────────────────────────────────────────────────
    nmMoveBtn.addEventListener('click', openMoveModal);
    nmCancelMove.addEventListener('click', closeMoveModal);
    nmMoveModal.addEventListener('click', function (e) {
        if (e.target === nmMoveModal) closeMoveModal();
    });

    function openMoveModal() {
        movingToFolderId = undefined; // nothing selected yet
        nmConfirmMove.disabled = true;
        renderFolderList('');
        nmFolderSearch.value = '';
        nmMoveModal.style.display = 'flex';
        nmFolderSearch.focus();
    }

    function closeMoveModal() {
        nmMoveModal.style.display = 'none';
    }

    nmFolderSearch.addEventListener('input', function () {
        renderFolderList(this.value.trim().toLowerCase());
    });

    function renderFolderList(q) {
        nmFolderList.innerHTML = '';

        // Root option
        var rootOpt = buildFolderOption(null, cfg.txtRoot, 'lucide-home', '');
        nmFolderList.appendChild(rootOpt);

        // Filter + sort folders by path
        var visible = allFolders.filter(function (f) {
            if (!q) return true;
            return (f.path || f.name || '').toLowerCase().indexOf(q) !== -1;
        });
        visible.sort(function (a, b) {
            return (a.path || a.name || '').localeCompare(b.path || b.name || '', undefined, { sensitivity: 'base' });
        });

        visible.forEach(function (f) {
            var icon  = f.icon  || 'lucide-folder';
            var color = f.icon_color || '';
            var opt = buildFolderOption(f.id, f.path || f.name, icon, color);
            nmFolderList.appendChild(opt);
        });
    }

    function buildFolderOption(id, label, icon, color) {
        var item = document.createElement('div');
        item.className = 'nm-folder-option';
        item.setAttribute('data-folder-id', id === null ? '' : id);
        var style = color ? ' style="color:' + escHtml(color) + '"' : '';
        item.innerHTML = '<i class="lucide ' + escHtml(icon) + '"' + style + '></i> ' + escHtml(label);
        item.addEventListener('click', function () {
            nmFolderList.querySelectorAll('.nm-folder-option').forEach(function (el) {
                el.classList.remove('nm-folder-option-selected');
            });
            item.classList.add('nm-folder-option-selected');
            movingToFolderId = (id === null) ? null : id;
            nmConfirmMove.disabled = false;
        });
        return item;
    }

    nmConfirmMove.addEventListener('click', function () {
        if (selectedIds.size === 0) return;
        performMove();
    });

    function performMove() {
        nmConfirmMove.disabled = true;
        nmConfirmMove.innerHTML = '<i class="lucide lucide-loader-2 lucide-spin"></i> ' + cfg.txtMoving;

        var ids = Array.from(selectedIds);
        var folderId = movingToFolderId; // null = root, number = folder

        var promises = ids.map(function (noteId) {
            var payload = { folder_id: folderId === null ? 0 : folderId };
            return fetch(apiUrl('notes/' + noteId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(function (r) { return r.json(); });
        });

        Promise.all(promises).then(function (results) {
            closeMoveModal();
            selectedIds.clear();

            // Update local note data with new folder info
            allFolders.forEach(function (f) {
                if (folderId !== null && f.id == folderId) {
                    results.forEach(function (res, i) {
                        var noteId = ids[i];
                        var note = allNotes.find(function (n) { return n.id == noteId; });
                        if (note) {
                            note.folder_id = f.id;
                            note.folder    = f.name;
                        }
                    });
                }
            });
            if (folderId === null) {
                ids.forEach(function (noteId) {
                    var note = allNotes.find(function (n) { return n.id == noteId; });
                    if (note) { note.folder_id = null; note.folder = null; }
                });
            }

            // Reset button
            nmConfirmMove.innerHTML = cfg.txtMoveTo;
            nmConfirmMove.disabled = true;

            applyFilter();
            updateBulkBar();
        }).catch(function (err) {
            closeMoveModal();
            alert(cfg.txtError + ': ' + err.message);
            nmConfirmMove.disabled = false;
        });
    }

    // ── Navigation ────────────────────────────────────────────────────────────
    document.getElementById('backToNotesBtn').addEventListener('click', function () {
        window.location.href = 'index.php' + (cfg.workspace ? '?workspace=' + encodeURIComponent(cfg.workspace) : '');
    });
    document.getElementById('backToHomeBtn').addEventListener('click', function () {
        window.location.href = 'home.php' + (cfg.workspace ? '?workspace=' + encodeURIComponent(cfg.workspace) : '');
    });

    // ── Filter events ─────────────────────────────────────────────────────────
    nmFilterInput.addEventListener('input', function () {
        filterText = this.value.trim().toLowerCase();
        nmClearFilter.style.display = filterText ? 'flex' : 'none';
        applyFilter();
    });
    nmClearFilter.addEventListener('click', function () {
        nmFilterInput.value = '';
        filterText = '';
        nmClearFilter.style.display = 'none';
        applyFilter();
        nmFilterInput.focus();
    });

    // ── Utils ─────────────────────────────────────────────────────────────────
    function show(el) { if (el) el.style.display = ''; }
    function hide(el) { if (el) el.style.display = 'none'; }

    function escHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    loadAll();

}());
