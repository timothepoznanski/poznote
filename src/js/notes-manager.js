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
        txtMove:        body.getAttribute('data-txt-move') || 'Move',
        txtChooseAction: body.getAttribute('data-txt-choose-action') || 'Choose an action...',
        txtAddTag:      body.getAttribute('data-txt-add-tag') || 'Add tag',
        txtRemoveTag:   body.getAttribute('data-txt-remove-tag') || 'Remove tag',
        txtAddFavorite: body.getAttribute('data-txt-add-favorite') || 'Add to favorites',
        txtRemoveFavorite: body.getAttribute('data-txt-remove-favorite') || 'Remove from favorites',
        txtTrash:       body.getAttribute('data-txt-trash') || 'Move to trash',
        txtTrashConfirm: body.getAttribute('data-txt-trash-confirm') || 'Move the selected notes to trash?',
        txtEnterTag:    body.getAttribute('data-txt-enter-tag') || 'Enter at least one tag',
        txtTagsPlaceholder: body.getAttribute('data-txt-tags-placeholder') || 'tag1, tag2',
        txtApplying:    body.getAttribute('data-txt-applying') || 'Applying...',
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
    var currentTagAction = '';

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
    var nmBulkActionSelect = document.getElementById('nmBulkActionSelect');
    var nmMoveModal      = document.getElementById('nmMoveModal');
    var nmFolderSearch   = document.getElementById('nmFolderSearch');
    var nmFolderList     = document.getElementById('nmFolderList');
    var nmConfirmMove    = document.getElementById('nmConfirmMove');
    var nmCancelMove     = document.getElementById('nmCancelMove');
    var nmTagModal       = document.getElementById('nmTagModal');
    var nmTagModalTitle  = document.getElementById('nmTagModalTitle');
    var nmTagInput       = document.getElementById('nmTagInput');
    var nmConfirmTag     = document.getElementById('nmConfirmTag');
    var nmCancelTag      = document.getElementById('nmCancelTag');

    // ── Helpers ───────────────────────────────────────────────────────────────
    function apiUrl(path) {
        return 'api/v1/' + path;
    }

    function wsParam() {
        return cfg.workspace ? '&workspace=' + encodeURIComponent(cfg.workspace) : '';
    }

    function wsQuery() {
        return cfg.workspace ? '?workspace=' + encodeURIComponent(cfg.workspace) : '';
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr.replace(' ', 'T') + 'Z');
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString();
    }

    function fetchJson(url, options) {
        return fetch(url, options).then(function (response) {
            return response.text().then(function (text) {
                var data = {};
                if (text) {
                    try {
                        data = JSON.parse(text);
                    } catch (err) {
                        throw new Error(response.statusText || cfg.txtError);
                    }
                }

                if (!response.ok || data.error) {
                    throw new Error(data.error || data.message || response.statusText || cfg.txtError);
                }

                return data;
            });
        });
    }

    function setButtonLoading(button, loadingText) {
        button.disabled = true;
        button.innerHTML = '<i class="lucide lucide-loader-2 lucide-spin"></i> ' + escHtml(loadingText);
    }

    function parseTags(tags) {
        var source = Array.isArray(tags)
            ? tags
            : String(tags || '').replace(/\s+/g, ',').split(',');

        return source.map(function (tag) {
            tag = typeof tag === 'string' ? tag.trim() : '';
            return tag ? tag.replace(/\s+/g, '_') : '';
        }).filter(Boolean);
    }

    function uniqueTags(tags) {
        var seen = new Set();
        return tags.filter(function (tag) {
            if (seen.has(tag)) return false;
            seen.add(tag);
            return true;
        });
    }

    function sameTags(left, right) {
        if (left.length !== right.length) return false;
        for (var i = 0; i < left.length; i += 1) {
            if (left[i] !== right[i]) return false;
        }
        return true;
    }

    function joinTags(tags) {
        return tags.join(', ');
    }

    function getSelectedNotes() {
        return Array.from(selectedIds).map(function (id) {
            return allNotes.find(function (note) { return note.id == id; });
        }).filter(Boolean);
    }

    function requestSelectedNotes(buildRequest) {
        var requests = [];
        var changedCount = 0;

        getSelectedNotes().forEach(function (note) {
            var request = buildRequest(note);
            if (!request) return;

            changedCount += 1;
            requests.push(fetchJson(request.url, request.options));
        });

        if (requests.length === 0) {
            return Promise.resolve({ changedCount: 0, results: [] });
        }

        return Promise.all(requests).then(function (results) {
            return { changedCount: changedCount, results: results };
        });
    }

    function patchSelectedNotes(buildPayload) {
        return requestSelectedNotes(function (note) {
            var payload = buildPayload(note);
            if (!payload) return null;

            return {
                url: apiUrl('notes/' + note.id),
                options: {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            };
        });
    }

    // ── Load data ─────────────────────────────────────────────────────────────
    function loadAll() {
        show(nmSpinner);
        nmContainer.innerHTML = '';
        hide(nmEmptyMessage);

        var notesUrl = apiUrl('notes?trash=0' + wsParam());
        var foldersUrl = apiUrl('folders?hierarchical=false' + wsParam());

        Promise.all([
            fetchJson(notesUrl),
            fetchJson(foldersUrl)
        ]).then(function (results) {
            var notesData   = results[0];
            var foldersData = results[1];

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
            nmBulkActionSelect.disabled = false;
        } else {
            nmBulkBar.classList.add('nm-bulk-bar-hidden');
            nmBulkActionSelect.disabled = true;
            nmBulkActionSelect.value = '';
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

    // ── Bulk actions ──────────────────────────────────────────────────────────
    nmBulkActionSelect.addEventListener('change', function () {
        var action = this.value;
        this.value = '';

        if (!action || selectedIds.size === 0) return;

        if (action === 'move') {
            openMoveModal();
            return;
        }

        if (action === 'add-tag' || action === 'remove-tag') {
            openTagModal(action);
            return;
        }

        if (action === 'add-favorite') {
            performFavoriteUpdate(1);
            return;
        }

        if (action === 'remove-favorite') {
            performFavoriteUpdate(0);
            return;
        }

        if (action === 'trash') {
            performTrash();
        }
    });

    // ── Move modal ────────────────────────────────────────────────────────────
    nmCancelMove.addEventListener('click', closeMoveModal);
    nmMoveModal.addEventListener('click', function (e) {
        if (e.target === nmMoveModal) closeMoveModal();
    });

    function openMoveModal() {
        movingToFolderId = undefined; // nothing selected yet
        nmConfirmMove.disabled = true;
        nmConfirmMove.textContent = cfg.txtMove;
        renderFolderList('');
        nmFolderSearch.value = '';
        nmMoveModal.style.display = 'flex';
        nmFolderSearch.focus();
    }

    function closeMoveModal() {
        nmMoveModal.style.display = 'none';
        movingToFolderId = undefined;
        nmConfirmMove.disabled = true;
        nmConfirmMove.textContent = cfg.txtMove;
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
        if (selectedIds.size === 0 || movingToFolderId === undefined) return;
        performMove();
    });

    function performMove() {
        var targetFolderId = movingToFolderId === null ? null : Number(movingToFolderId);

        setButtonLoading(nmConfirmMove, cfg.txtMoving);

        patchSelectedNotes(function (note) {
            var currentFolderId = note.folder_id == null ? null : Number(note.folder_id);
            if (currentFolderId === targetFolderId) {
                return null;
            }

            return { folder_id: targetFolderId === null ? 0 : targetFolderId };
        }).then(function (result) {
            closeMoveModal();
            if (result.changedCount > 0) {
                selectedIds.clear();
                loadAll();
            }
            updateBulkBar();
        }).catch(function (err) {
            closeMoveModal();
            alert(cfg.txtError + ': ' + err.message);
            loadAll();
        });
    }

    // ── Tag modal ─────────────────────────────────────────────────────────────
    nmCancelTag.addEventListener('click', closeTagModal);
    nmTagModal.addEventListener('click', function (e) {
        if (e.target === nmTagModal) closeTagModal();
    });

    nmTagInput.addEventListener('input', function () {
        nmConfirmTag.disabled = parseTags(this.value).length === 0;
    });

    nmConfirmTag.addEventListener('click', function () {
        var inputTags = uniqueTags(parseTags(nmTagInput.value));
        if (!inputTags.length) {
            alert(cfg.txtEnterTag);
            return;
        }

        performTagUpdate(currentTagAction, inputTags);
    });

    function openTagModal(action) {
        currentTagAction = action;

        var label = action === 'add-tag' ? cfg.txtAddTag : cfg.txtRemoveTag;
        nmTagModalTitle.textContent = label;
        nmConfirmTag.textContent = label;
        nmConfirmTag.disabled = true;
        nmTagInput.value = '';
        nmTagInput.placeholder = cfg.txtTagsPlaceholder;
        nmTagModal.style.display = 'flex';
        nmTagInput.focus();
    }

    function closeTagModal() {
        currentTagAction = '';
        nmTagModal.style.display = 'none';
        nmTagInput.value = '';
        nmConfirmTag.disabled = true;
        nmConfirmTag.textContent = cfg.txtAddTag;
        nmTagModalTitle.textContent = cfg.txtAddTag;
    }

    function performTagUpdate(action, inputTags) {
        if (!action || selectedIds.size === 0) return;

        setButtonLoading(nmConfirmTag, cfg.txtApplying);

        patchSelectedNotes(function (note) {
            var existingTags = parseTags(note.tags || '');
            var nextTags = existingTags.slice();

            if (action === 'add-tag') {
                inputTags.forEach(function (tag) {
                    if (nextTags.indexOf(tag) === -1) {
                        nextTags.push(tag);
                    }
                });
            } else {
                var tagsToRemove = new Set(inputTags);
                nextTags = existingTags.filter(function (tag) {
                    return !tagsToRemove.has(tag);
                });
            }

            if (sameTags(existingTags, nextTags)) {
                return null;
            }

            return { tags: joinTags(nextTags) };
        }).then(function (result) {
            closeTagModal();
            if (result.changedCount > 0) {
                selectedIds.clear();
                loadAll();
            }
            updateBulkBar();
        }).catch(function (err) {
            closeTagModal();
            alert(cfg.txtError + ': ' + err.message);
            loadAll();
        });
    }

    function performFavoriteUpdate(targetFavorite) {
        if (selectedIds.size === 0) return;

        nmBulkActionSelect.disabled = true;

        requestSelectedNotes(function (note) {
            var currentFavorite = Number(note.favorite || 0);
            if (currentFavorite === targetFavorite) {
                return null;
            }

            return {
                url: apiUrl('notes/' + note.id + '/favorite' + wsQuery()),
                options: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: cfg.workspace ? JSON.stringify({ workspace: cfg.workspace }) : '{}'
                }
            };
        }).then(function (result) {
            if (result.changedCount > 0) {
                selectedIds.clear();
                loadAll();
            } else {
                nmBulkActionSelect.disabled = false;
            }
            updateBulkBar();
        }).catch(function (err) {
            nmBulkActionSelect.disabled = false;
            alert(cfg.txtError + ': ' + err.message);
            loadAll();
        });
    }

    function performTrash() {
        if (selectedIds.size === 0) return;
        if (!window.confirm(cfg.txtTrashConfirm)) return;

        nmBulkActionSelect.disabled = true;

        requestSelectedNotes(function (note) {
            return {
                url: apiUrl('notes/' + note.id + wsQuery()),
                options: {
                    method: 'DELETE'
                }
            };
        }).then(function (result) {
            if (result.changedCount > 0) {
                selectedIds.clear();
                loadAll();
            } else {
                nmBulkActionSelect.disabled = false;
            }
            updateBulkBar();
        }).catch(function (err) {
            nmBulkActionSelect.disabled = false;
            alert(cfg.txtError + ': ' + err.message);
            loadAll();
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
