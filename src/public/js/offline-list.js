// Offline page (offline_notes.php): the notes and folders kept offline, laid
// out like the Shares page (js/shared-page.js), with why each note is kept
// and the notes this browser does not hold a copy of yet.

(function() {
    'use strict';

    function getConfig() {
        var body = document.body;
        function txt(name, fallback) {
            return body.getAttribute('data-txt-' + name) || fallback;
        }
        return {
            workspace: body.getAttribute('data-workspace') || '',
            txtError: txt('error', 'Error'),
            txtUntitled: txt('untitled', 'Untitled'),
            txtTableName: txt('table-name', 'Name'),
            txtTableReason: txt('table-reason', 'Reason'),
            txtTableActions: txt('table-actions', 'Actions'),
            txtReasonNote: txt('reason-note', 'Kept offline'),
            txtReasonFolder: txt('reason-folder', 'In a folder kept offline'),
            txtReasonFavorite: txt('reason-favorite', 'Favorite'),
            txtReasonRecent: txt('reason-recent', 'Modified in the last {{days}} days'),
            txtReasonRecentOne: txt('reason-recent-one', 'Modified in the last day'),
            txtFolderDirect: txt('folder-direct', 'Kept offline'),
            txtFolderParent: txt('folder-parent', 'Via a parent folder'),
            txtKeep: txt('keep', 'Keep offline'),
            txtStop: txt('stop', 'Stop keeping offline'),
            txtKeepError: txt('keep-error', 'The offline setting could not be saved.'),
            txtNotInBrowser: txt('not-in-browser', 'Not available offline in this browser'),
            txtUnsupported: txt('unsupported', 'This browser cannot keep notes offline.'),
            txtEmpty: txt('empty', 'Nothing is available offline yet.'),
            txtEmptyHint: txt('empty-hint', ''),
            txtDisabled: txt('disabled', 'Offline notes are turned off.'),
            txtDisabledHint: txt('disabled-hint', ''),
            txtNoNotes: txt('no-notes', 'No notes available offline.'),
            txtNoFolders: txt('no-folders', 'No folders kept offline.'),
            txtOwnAccountOnly: txt('own-account-only', 'Offline copies are only kept for your own account.'),
            txtNoFilterResults: txt('no-filter-results', 'No notes match your search.'),
            txtExpandFolder: txt('expand-folder', 'Expand folder'),
            txtCollapseFolder: txt('collapse-folder', 'Collapse folder'),
            txtExpandAll: txt('expand-all', 'Expand all'),
            txtCollapseAll: txt('collapse-all', 'Collapse all')
        };
    }

    var config = getConfig();

    function withDays(text, days) {
        return String(text).replace(/\{\{\s*days\s*\}\}/g, String(days));
    }

    // ========== State ==========

    var offlineDays = 0;
    var offlineNotes = [];
    var offlineFolders = [];
    var allItems = [];
    var filteredItems = [];
    var filterText = '';
    var filterType = 'all';
    // Note ids this browser holds a copy of; null while unknown
    var deviceNoteIds = null;
    var COLLAPSED_FOLDERS_STORAGE_KEY = 'poznote.offline.collapsedFolders';
    var currentBranchMeta = {};
    var currentCollapsibleFolderIds = [];
    var collapsedFolderIds = loadCollapsedFolderIds();

    function loadCollapsedFolderIds() {
        try {
            var parsed = JSON.parse(window.localStorage.getItem(COLLAPSED_FOLDERS_STORAGE_KEY) || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveCollapsedFolderIds() {
        try {
            window.localStorage.setItem(COLLAPSED_FOLDERS_STORAGE_KEY, JSON.stringify(collapsedFolderIds));
        } catch (e) { /* ignore */ }
    }

    function isFolderCollapsed(folderId) {
        return !!collapsedFolderIds[String(folderId)];
    }

    function toggleFolderCollapsed(folderId) {
        var key = String(folderId);
        if (collapsedFolderIds[key]) {
            delete collapsedFolderIds[key];
        } else {
            collapsedFolderIds[key] = true;
        }
        saveCollapsedFolderIds();
        renderItems();
    }

    function workspaceParam(prefix) {
        return config.workspace ? prefix + 'workspace=' + encodeURIComponent(config.workspace) : '';
    }

    // ========== Filter ==========

    function updateClearButton() {
        var clearBtn = document.getElementById('clearFilterBtn');
        if (clearBtn) {
            clearBtn.style.display = filterText ? 'flex' : 'none';
        }
    }

    function applyFilter() {
        filteredItems = allItems.filter(function(item) {
            if (filterType === 'notes' && item._type !== 'note') return false;
            if (filterType === 'folders' && item._type !== 'folder') return false;
            if (!filterText) return true;
            var name = item._type === 'note' ? (item.heading || config.txtUntitled) : (item.folder_name || '');
            return name.toLowerCase().indexOf(filterText) !== -1
                || (item.folder_path || '').toLowerCase().indexOf(filterText) !== -1;
        });
        renderItems();
        updateFilterStats();
    }

    function getCurrentScopeTotal() {
        if (filterType === 'notes') return offlineNotes.length;
        if (filterType === 'folders') return offlineFolders.length;
        return allItems.length;
    }

    function updateFilterStats() {
        var statsDiv = document.getElementById('filterStats');
        if (!statsDiv) return;
        var total = getCurrentScopeTotal();
        statsDiv.textContent = filteredItems.length + ' / ' + total;
        statsDiv.style.display = total > 0 ? 'block' : 'none';
    }

    function syncUrl() {
        var params = new URLSearchParams(window.location.search);
        if (filterText) {
            params.set('filter', filterText);
        } else {
            params.delete('filter');
        }
        if (filterType !== 'all') {
            params.set('type', filterType);
        } else {
            params.delete('type');
        }
        var search = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (search ? '?' + search : ''));
    }

    function updateFilterTypeButtons() {
        var counts = { notes: offlineNotes.length, folders: offlineFolders.length };
        var buttons = document.querySelectorAll('.filter-type-btn');
        // "All" only means something when there are folders to mix with the notes
        var showAll = counts.folders > 0;
        buttons.forEach(function(btn) {
            var type = btn.getAttribute('data-filter');
            btn.classList.toggle('initially-hidden', type === 'all' ? !showAll : !counts[type]);
        });
        // Back to "All" (or "Notes" when "All" is hidden) when the active
        // category has nothing left to show
        var fallback = showAll ? 'all' : 'notes';
        if ((counts.notes || counts.folders) && filterType !== fallback
            && (filterType === 'all' ? !showAll : !counts[filterType])) {
            filterType = fallback;
            buttons.forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-filter') === fallback);
            });
            syncUrl();
        }
    }

    // ========== Tree ==========

    function byName(getName) {
        return function(a, b) {
            return getName(a).toLowerCase().localeCompare(getName(b).toLowerCase());
        };
    }

    // Folders in tree order, each followed by its notes then its subfolders;
    // the notes outside the listed folders come last.
    function buildTreeSequence(items) {
        var ordered = [];
        var folders = [];
        var notesByFolderId = {};
        var standaloneNotes = [];
        var foldersById = {};
        var childrenByParentId = {};
        var noteName = function(note) { return note.heading || config.txtUntitled; };
        var folderName = function(folder) { return folder.folder_name || ''; };

        items.forEach(function(item) {
            delete item._depth;
            if (item._type === 'folder') {
                folders.push(item);
                foldersById[String(item.folder_id)] = item;
            }
        });

        items.forEach(function(item) {
            if (item._type !== 'note') return;
            var key = item.folder_id != null ? String(item.folder_id) : '';
            if (key && foldersById[key]) {
                (notesByFolderId[key] = notesByFolderId[key] || []).push(item);
            } else {
                standaloneNotes.push(item);
            }
        });

        folders.sort(byName(folderName)).forEach(function(folder) {
            var parentKey = folder.parent_id != null ? String(folder.parent_id) : '';
            (childrenByParentId[parentKey] = childrenByParentId[parentKey] || []).push(folder);
        });

        function appendBranch(folder, depth) {
            var key = String(folder.folder_id);
            folder._depth = depth;
            ordered.push(folder);
            (notesByFolderId[key] || []).sort(byName(noteName)).forEach(function(note) {
                note._depth = depth + 1;
                ordered.push(note);
            });
            (childrenByParentId[key] || []).forEach(function(child) {
                appendBranch(child, depth + 1);
            });
        }

        folders.forEach(function(folder) {
            var parentKey = folder.parent_id != null ? String(folder.parent_id) : '';
            if (!parentKey || !foldersById[parentKey]) {
                appendBranch(folder, 0);
            }
        });

        standaloneNotes.sort(byName(noteName)).forEach(function(note) {
            ordered.push(note);
        });
        return ordered;
    }

    // Which folders have something under them, and what stays visible once
    // the collapsed ones are folded (a search shows everything).
    function buildPresentation(items) {
        var branchMeta = {};
        var ancestors = [];
        var collapseEnabled = !filterText;
        var visible = [];
        var collapsedDepth = null;

        items.forEach(function(item) {
            var depth = item._depth || 0;
            ancestors.length = Math.min(ancestors.length, depth);
            ancestors.forEach(function(folderKey) {
                branchMeta[folderKey].descendantCount += 1;
            });
            if (item._type === 'folder') {
                branchMeta[String(item.folder_id)] = { descendantCount: 0 };
                ancestors[depth] = String(item.folder_id);
            }
        });

        items.forEach(function(item) {
            var depth = item._depth || 0;
            if (collapsedDepth !== null && depth <= collapsedDepth) {
                collapsedDepth = null;
            }
            if (!collapseEnabled || collapsedDepth === null) {
                visible.push(item);
            }
            if (collapseEnabled && collapsedDepth === null && item._type === 'folder') {
                var key = String(item.folder_id);
                if (branchMeta[key].descendantCount > 0 && isFolderCollapsed(key)) {
                    collapsedDepth = depth;
                }
            }
        });

        return {
            branchMeta: branchMeta,
            collapsibleFolderIds: Object.keys(branchMeta).filter(function(key) {
                return branchMeta[key].descendantCount > 0;
            }),
            visibleItems: visible,
            searchExpanded: !collapseEnabled
        };
    }

    function shouldExpandAllFolders() {
        return currentCollapsibleFolderIds.some(isFolderCollapsed);
    }

    function updateTreeToolbar(presentation) {
        var toolbar = document.getElementById('sharedTreeToolbar');
        var toggleBtn = document.getElementById('toggleAllFoldersBtn');
        var show = !!(presentation && presentation.collapsibleFolderIds.length > 0);

        currentBranchMeta = presentation ? presentation.branchMeta : {};
        currentCollapsibleFolderIds = presentation ? presentation.collapsibleFolderIds.slice() : [];

        if (toolbar) toolbar.classList.toggle('initially-hidden', !show);
        if (!show || !toggleBtn) return;

        var expand = shouldExpandAllFolders();
        var labelEl = document.getElementById('toggleAllFoldersLabel');
        var icon = toggleBtn.querySelector('.lucide');
        toggleBtn.disabled = presentation.searchExpanded;
        toggleBtn.setAttribute('aria-expanded', expand ? 'false' : 'true');
        if (labelEl) labelEl.textContent = expand ? config.txtExpandAll : config.txtCollapseAll;
        if (icon) {
            icon.classList.toggle('lucide-chevron-down', expand);
            icon.classList.toggle('lucide-chevron-up', !expand);
        }
    }

    function setAllFoldersCollapsed(collapsed) {
        if (filterText) return;
        currentCollapsibleFolderIds.forEach(function(folderId) {
            if (collapsed) {
                collapsedFolderIds[String(folderId)] = true;
            } else {
                delete collapsedFolderIds[String(folderId)];
            }
        });
        saveCollapsedFolderIds();
        renderItems();
    }

    // ========== Data ==========

    function showEmpty(text, hint) {
        var emptyMessage = document.getElementById('emptyMessage');
        var textEl = document.getElementById('emptyMessageText');
        var hintEl = document.getElementById('emptyMessageHint');
        if (textEl) textEl.textContent = text;
        if (hintEl) {
            hintEl.textContent = hint || '';
            hintEl.style.display = hint ? '' : 'none';
        }
        if (emptyMessage) emptyMessage.style.display = 'block';
    }

    function showError(message) {
        var container = document.getElementById('sharedItemsContainer');
        if (!container) return;
        var errDiv = document.createElement('div');
        errDiv.className = 'error-message';
        errDiv.textContent = message;
        container.innerHTML = '';
        container.appendChild(errDiv);
    }

    function loadOfflineList() {
        var spinner = document.getElementById('loadingSpinner');
        var filterBar = document.getElementById('sharedFilterBar');
        var emptyMessage = document.getElementById('emptyMessage');

        return fetch('api/v1/offline/list' + workspaceParam('?'), { credentials: 'same-origin' })
            .then(function(response) {
                return response.json().catch(function() { return {}; }).then(function(data) {
                    if (response.status === 403 && data.code === 'offline_unavailable') {
                        throw new Error(config.txtOwnAccountOnly);
                    }
                    if (!response.ok || !data.success) {
                        throw new Error(config.txtError + ': ' + (data.error || data.message || 'HTTP ' + response.status));
                    }
                    return data;
                });
            })
            .then(function(data) {
                if (spinner) spinner.style.display = 'none';
                offlineDays = Number(data.days) || 0;
                offlineNotes = (data.notes || []).map(function(note) { note._type = 'note'; return note; });
                offlineFolders = (data.folders || []).map(function(folder) { folder._type = 'folder'; return folder; });
                allItems = offlineFolders.concat(offlineNotes);

                if (filterBar) filterBar.classList.toggle('initially-hidden', allItems.length === 0);
                if (emptyMessage) emptyMessage.style.display = 'none';
                updateFilterTypeButtons();
                if (allItems.length === 0) {
                    document.getElementById('sharedItemsContainer').innerHTML = '';
                    if (offlineDays > 0) {
                        showEmpty(config.txtEmpty, withDays(config.txtEmptyHint, offlineDays));
                    } else {
                        showEmpty(config.txtDisabled, config.txtDisabledHint);
                    }
                    return;
                }
                applyFilter();
            })
            .catch(function(error) {
                if (spinner) spinner.style.display = 'none';
                showError(error.message);
            });
    }

    // The copies this browser holds (js/offline-store.js), read after the
    // sync writes-only mode of js/offline-sync.js has brought them up to date.
    function readDeviceCopies() {
        var Store = window.PoznoteOffline;
        var notice = document.getElementById('offlineDeviceNotice');
        if (!Store || !Store.isSupported()) {
            deviceNoteIds = null;
            if (notice) {
                notice.textContent = config.txtUnsupported;
                notice.classList.remove('initially-hidden');
            }
            return Promise.resolve();
        }
        var match = document.cookie.match(/(?:^|; )poznote_account=([^;]*)/);
        var pageAccount = Number(match ? decodeURIComponent(match[1]) : 0);
        return Store.getMeta('current').then(function(current) {
            // Another account's copies say nothing about this one
            if (!pageAccount || !current || Number(current.userId) !== pageAccount) {
                return [];
            }
            return Store.getNotes(pageAccount);
        }).then(function(records) {
            deviceNoteIds = {};
            (records || []).forEach(function(record) { deviceNoteIds[String(record.id)] = true; });
        }).catch(function(e) {
            deviceNoteIds = null;
            console.debug('offline-list: the offline copies could not be read:', e);
        });
    }

    function syncThenReadDevice() {
        var sync = typeof window.poznoteOfflineSyncNow === 'function'
            ? Promise.resolve(window.poznoteOfflineSyncNow()).catch(function() {})
            : Promise.resolve();
        return sync.then(readDeviceCopies).then(function() {
            if (allItems.length) renderItems();
        });
    }

    function setKeptOffline(kind, id, keep) {
        return fetch('api/v1/' + (kind === 'folder' ? 'folders' : 'notes') + '/' + encodeURIComponent(id) + '/offline', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ offline: keep })
        })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (!data || !data.success) {
                    throw new Error((data && (data.error || data.message)) || 'Unknown error');
                }
                return loadOfflineList().then(syncThenReadDevice);
            })
            .catch(function(error) {
                console.error('Offline keep error:', error);
                if (typeof window.showNotificationPopup === 'function') {
                    window.showNotificationPopup(config.txtKeepError, 'error');
                } else {
                    window.alert(config.txtKeepError);
                }
            });
    }

    // ========== Rendering ==========

    function reasonText(note) {
        switch (note.reason) {
            case 'note': return config.txtReasonNote;
            case 'folder': return config.txtReasonFolder;
            case 'favorite': return config.txtReasonFavorite;
            default: return offlineDays === 1 ? config.txtReasonRecentOne : withDays(config.txtReasonRecent, offlineDays);
        }
    }

    function renderReasonCell(text) {
        var wrap = document.createElement('div');
        wrap.className = 'note-token-wrap read-only offline-reason-cell';
        var content = document.createElement('span');
        content.className = 'note-token read-only';
        content.textContent = text;
        content.title = text;
        wrap.appendChild(content);
        return wrap;
    }

    function renderToggleButton(kind, id, kept) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm ' + (kept ? 'btn-danger' : 'btn-primary');
        btn.innerHTML = kept ? '<i class="lucide lucide-x"></i>' : '<i class="lucide lucide-wifi-off"></i>';
        btn.title = kept ? config.txtStop : config.txtKeep;
        btn.setAttribute('aria-label', btn.title);
        btn.addEventListener('click', function() {
            btn.disabled = true;
            setKeptOffline(kind, id, !kept).then(function() {
                btn.disabled = false;
            });
        });
        return btn;
    }

    function appendTypeIcon(container, iconClass, color, roleClass) {
        var icon = document.createElement('i');
        icon.className = 'lucide ' + iconClass + ' ' + roleClass + ' shared-type-icon';
        if (color) {
            icon.style.setProperty('color', window.poznoteIconColorCss ? window.poznoteIconColorCss(color) : color, 'important');
            icon.setAttribute('data-icon-color', color);
        }
        container.appendChild(icon);
    }

    function applyDepth(element, depth, isChildNote) {
        element.style.setProperty('--shared-indent-level', String(depth || 0));
        if (depth > 0) element.classList.add('shared-hierarchy-item');
        if (isChildNote) element.classList.add('shared-note-child');
    }

    function renderNoteItem(note) {
        var item = document.createElement('div');
        item.className = 'shared-item shared-note-item';
        item.dataset.noteId = note.note_id;
        item.dataset.itemType = 'note';
        applyDepth(item, note._depth || 0, (note._depth || 0) > 0);

        var nameContainer = document.createElement('div');
        nameContainer.className = 'note-name-container';
        appendTypeIcon(nameContainer, note.icon || 'lucide-sticky-note', note.icon_color, 'note-icon');

        var link = document.createElement('a');
        link.href = 'index.php?note=' + encodeURIComponent(note.note_id) + (note.workspace ? '&workspace=' + encodeURIComponent(note.workspace) : '');
        link.className = 'note-name';
        link.textContent = note.heading || config.txtUntitled;
        if (note.folder_path) link.title = note.folder_path;
        nameContainer.appendChild(link);

        if (deviceNoteIds && !deviceNoteIds[String(note.note_id)]) {
            var missing = document.createElement('i');
            missing.className = 'lucide lucide-alert-circle offline-missing-icon';
            missing.title = config.txtNotInBrowser;
            missing.setAttribute('role', 'img');
            missing.setAttribute('aria-label', config.txtNotInBrowser);
            nameContainer.appendChild(missing);
            item.classList.add('is-not-in-browser');
        }
        item.appendChild(nameContainer);

        item.appendChild(renderReasonCell(reasonText(note)));

        var actions = document.createElement('div');
        actions.className = 'note-actions';
        actions.appendChild(renderToggleButton('note', note.note_id, note.reason === 'note'));
        item.appendChild(actions);
        return item;
    }

    function renderFolderItem(folder) {
        var key = String(folder.folder_id);
        var isCollapsible = (currentBranchMeta[key] || { descendantCount: 0 }).descendantCount > 0;
        var isCollapsed = isCollapsible && !filterText && isFolderCollapsed(key);

        var item = document.createElement('div');
        item.className = 'shared-item shared-note-item shared-folder-row';
        item.dataset.folderId = folder.folder_id;
        item.dataset.itemType = 'folder';
        item.dataset.collapsible = isCollapsible ? '1' : '0';
        item.dataset.collapsed = isCollapsed ? '1' : '0';
        if (!folder.is_direct) item.classList.add('shared-via-parent');
        if (isCollapsible) item.classList.add('is-collapsible');
        if (isCollapsed) item.classList.add('is-collapsed');
        applyDepth(item, folder._depth || 0, false);

        var nameContainer = document.createElement('div');
        nameContainer.className = 'note-name-container';

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'shared-folder-toggle' + (isCollapsible ? '' : ' is-placeholder');
        if (isCollapsible) {
            var label = isCollapsed ? config.txtExpandFolder : config.txtCollapseFolder;
            toggle.title = label;
            toggle.setAttribute('aria-label', label);
            toggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            toggle.innerHTML = '<i class="lucide ' + (isCollapsed ? 'lucide-chevron-right' : 'lucide-chevron-down') + '"></i>';
            toggle.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                toggleFolderCollapsed(folder.folder_id);
            });
        } else {
            toggle.setAttribute('aria-hidden', 'true');
            toggle.tabIndex = -1;
            toggle.innerHTML = '<span class="shared-folder-toggle-placeholder"></span>';
        }
        nameContainer.appendChild(toggle);

        appendTypeIcon(nameContainer, folder.icon || 'lucide-folder', folder.icon_color, 'folder-icon');

        var link = document.createElement('a');
        link.href = 'index.php?kanban=' + encodeURIComponent(folder.folder_id) + (folder.workspace ? '&workspace=' + encodeURIComponent(folder.workspace) : '');
        link.className = 'folder-name-path note-name';
        link.title = folder.folder_path;
        link.textContent = folder.folder_name + ' (' + folder.note_count + ')';
        nameContainer.appendChild(link);
        item.appendChild(nameContainer);

        item.appendChild(renderReasonCell(folder.is_direct ? config.txtFolderDirect : config.txtFolderParent));

        var actions = document.createElement('div');
        actions.className = 'note-actions';
        // Kept through a parent: only that parent can be stopped
        if (folder.is_direct) {
            actions.appendChild(renderToggleButton('folder', folder.folder_id, true));
        }
        item.appendChild(actions);
        return item;
    }

    function renderHeader() {
        var header = document.createElement('div');
        header.className = 'shared-notes-header';
        [
            ['shared-notes-header-note', config.txtTableName],
            ['shared-notes-header-token', config.txtTableReason],
            ['shared-notes-header-actions', config.txtTableActions]
        ].forEach(function(cell) {
            var el = document.createElement('div');
            el.className = 'shared-notes-header-cell ' + cell[0];
            el.textContent = cell[1];
            header.appendChild(el);
        });
        return header;
    }

    function renderItems() {
        var container = document.getElementById('sharedItemsContainer');
        if (!container) return;
        container.innerHTML = '';

        if (filteredItems.length === 0) {
            updateTreeToolbar(null);
            var message = filterText ? config.txtNoFilterResults
                : (filterType === 'folders' ? config.txtNoFolders : config.txtNoNotes);
            var empty = document.createElement('div');
            empty.className = 'empty-message';
            var p = document.createElement('p');
            p.textContent = message;
            empty.appendChild(p);
            container.appendChild(empty);
            return;
        }

        var list = document.createElement('div');
        list.className = 'shared-notes-list';
        list.appendChild(renderHeader());

        var itemsToRender = filteredItems;
        if (filterType === 'notes') {
            updateTreeToolbar(null);
            itemsToRender = filteredItems.slice().sort(byName(function(note) { return note.heading || config.txtUntitled; }));
            itemsToRender.forEach(function(note) { delete note._depth; });
        } else {
            var presentation = buildPresentation(buildTreeSequence(filteredItems));
            updateTreeToolbar(presentation);
            itemsToRender = presentation.visibleItems;
        }

        itemsToRender.forEach(function(item) {
            list.appendChild(item._type === 'note' ? renderNoteItem(item) : renderFolderItem(item));
        });

        container.appendChild(list);
        adjustColumnWidths();
    }

    // Same content-adaptive columns as the Shares page: each column hugs its
    // widest cell, scaled back proportionally when they do not fit.
    function adjustColumnWidths() {
        var list = document.querySelector('#sharedItemsContainer .shared-notes-list');
        if (!list) return;

        list.style.removeProperty('width');
        if (window.innerWidth <= 800) {
            list.style.removeProperty('--shared-name-width');
            list.style.removeProperty('--shared-token-width');
            list.style.removeProperty('--shared-actions-width');
            return;
        }

        function maxCellWidth(selector) {
            var max = 0;
            list.querySelectorAll(selector).forEach(function(cell) {
                max = Math.max(max, cell.getBoundingClientRect().width);
            });
            return Math.ceil(max);
        }

        list.classList.add('shared-measure');
        var nameW = maxCellWidth('.shared-notes-header-note, .note-name-container');
        var reasonW = maxCellWidth('.shared-notes-header-token, .note-token-wrap');
        var actionsW = maxCellWidth('.shared-notes-header-actions, .note-actions');
        list.classList.remove('shared-measure');

        var styles = getComputedStyle(list);
        var gap = parseFloat(styles.getPropertyValue('--shared-column-gap')) || 16;
        var actionsColW = Math.max(actionsW + 2, 120);
        var mins = [180, 140, actionsColW];
        var widths = [Math.max(nameW + 2, mins[0]), Math.max(reasonW + 2, mins[1]), actionsColW];
        var padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
        var available = list.clientWidth - padX - gap * 2 - 12;

        for (var pass = 0; pass < 3; pass++) {
            var total = widths[0] + widths[1] + widths[2];
            if (available <= 0 || total <= available) break;
            var over = total - available;
            var slack = 0;
            for (var i = 0; i < widths.length; i++) slack += Math.max(0, widths[i] - mins[i]);
            if (slack <= 0) break;
            for (var j = 0; j < widths.length; j++) {
                var colSlack = Math.max(0, widths[j] - mins[j]);
                widths[j] -= Math.min(colSlack, Math.ceil(over * colSlack / slack));
            }
        }

        list.style.setProperty('--shared-name-width', widths[0] + 'px');
        list.style.setProperty('--shared-token-width', widths[1] + 'px');
        list.style.setProperty('--shared-actions-width', widths[2] + 'px');
        list.style.width = (widths[0] + widths[1] + widths[2] + gap * 2 + 12) + 'px';
    }

    // ========== Initialization ==========

    document.addEventListener('DOMContentLoaded', function() {
        var filterBtns = document.querySelectorAll('.filter-type-btn');
        var filterInput = document.getElementById('filterInput');
        var clearFilterBtn = document.getElementById('clearFilterBtn');
        var toggleAllBtn = document.getElementById('toggleAllFoldersBtn');

        var urlParams = new URLSearchParams(window.location.search);
        var initialFilter = urlParams.get('filter');
        if (initialFilter && filterInput) {
            filterInput.value = initialFilter;
            filterText = initialFilter.trim().toLowerCase();
            updateClearButton();
        }
        var initialType = urlParams.get('type');
        if (initialType === 'notes' || initialType === 'folders') {
            filterType = initialType;
            filterBtns.forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-filter') === filterType);
            });
        }

        filterBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                filterBtns.forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                filterType = btn.getAttribute('data-filter');
                applyFilter();
                syncUrl();
            });
        });

        function setFilterText(value) {
            filterText = value.trim().toLowerCase();
            applyFilter();
            updateClearButton();
            syncUrl();
        }

        if (filterInput) {
            filterInput.addEventListener('input', function() {
                setFilterText(filterInput.value);
            });
            filterInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    filterInput.value = '';
                    setFilterText('');
                }
            });
        }
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function() {
                if (!filterInput) return;
                filterInput.value = '';
                setFilterText('');
                filterInput.focus();
            });
        }
        if (toggleAllBtn) {
            toggleAllBtn.addEventListener('click', function(event) {
                setAllFoldersCollapsed(!shouldExpandAllFolders());
                if (event.detail !== 0) toggleAllBtn.blur();
            });
        }

        loadOfflineList().then(syncThenReadDevice);
    });

    var resizeTimer = null;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(adjustColumnWidths, 150);
    });
})();
