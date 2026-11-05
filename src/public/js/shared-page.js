// Unified shared page - handles both shared notes and shared folders
// with type filtering (all / notes / folders)

(function() {
    'use strict';

    // ========== Configuration ==========

    function getConfig() {
        var body = document.body;
        return {
            workspace: body.getAttribute('data-workspace') || '',
            txtError: body.getAttribute('data-txt-error') || 'Error',
            txtUntitled: body.getAttribute('data-txt-untitled') || 'Untitled',
            txtEditToken: body.getAttribute('data-txt-edit-token') || 'Click to edit token',
            txtPasswordLabel: body.getAttribute('data-txt-password-label') || 'Password',
            txtOpen: body.getAttribute('data-txt-open') || 'Open public view',
            txtCopyUrl: body.getAttribute('data-txt-copy-url') || 'Copy URL',
            txtUrlCopied: body.getAttribute('data-txt-url-copied') || 'URL copied!',
            txtRevoke: body.getAttribute('data-txt-revoke') || 'Revoke',
            txtRevokeModalTextViaFolder: body.getAttribute('data-txt-revoke-modal-text-via-folder') || 'This note is shared through a folder. You can make just this note inaccessible; the folder share and its other notes are not affected.',
            txtRevokeModalTextViaFolderDisabled: body.getAttribute('data-txt-revoke-modal-text-via-folder-disabled') || 'This note is currently inaccessible. You can make it accessible again through its folder share.',
            txtRevokeModalTextViaFolderParentDisabled: body.getAttribute('data-txt-revoke-modal-text-via-folder-parent-disabled') || 'This note is inaccessible because its folder share has been made inaccessible. Make the folder share accessible again to restore access.',
            txtShareDisabledBadge: body.getAttribute('data-txt-share-disabled-badge') || 'Inaccessible',
            txtShareDisabledHelp: body.getAttribute('data-txt-share-disabled-help') || 'This share is inaccessible: the link no longer works until you make it accessible again.',

            txtNoteSharedThroughFolder: body.getAttribute('data-txt-note-shared-through-folder') || 'Note shared through folder',
            txtFolderSharedThroughParent: body.getAttribute('data-txt-folder-shared-through-parent') || 'Folder shared through parent folder',
            txtNoFilterResults: body.getAttribute('data-txt-no-filter-results') || 'No items match your search.',
            txtTableName: body.getAttribute('data-txt-table-name') || 'Name',
            txtTableToken: body.getAttribute('data-txt-table-token') || 'Token',

            txtTokenHelp: body.getAttribute('data-txt-token-help') || 'The token is the unique part you choose in the public link. For example, using project-2026 gives https://your-domain.example/project-2026 for a note, or https://your-domain.example/folder/project-2026 for a folder.',
            txtTableActions: body.getAttribute('data-txt-table-actions') || 'Actions',

            txtCancel: body.getAttribute('data-txt-cancel') || 'Cancel',
            txtViaFolder: body.getAttribute('data-txt-via-folder') || 'Shared via folder',

            txtRestrictedBadge: body.getAttribute('data-txt-restricted-badge') || 'Restricted',
            txtRestrictedHelp: body.getAttribute('data-txt-restricted-help') || 'When restricted, only the listed users can access this share after logging in.',

            txtSharedBy: body.getAttribute('data-txt-shared-by') || 'Shared by',
            txtExpandFolder: body.getAttribute('data-txt-expand-folder') || 'Expand folder',
            txtCollapseFolder: body.getAttribute('data-txt-collapse-folder') || 'Collapse folder',
            txtExpandAll: body.getAttribute('data-txt-expand-all') || 'Expand all',
            txtCollapseAll: body.getAttribute('data-txt-collapse-all') || 'Collapse all'
        };
    }

    var config = getConfig();

    // The share settings dialog and the helpers it shares with this page
    var shareSettings = window.PoznoteShareSettings;
    var showShareToast = shareSettings.showErrorToast;
    var showRevokeShareModal = shareSettings.showRevokeModal;
    var showCopyToast = shareSettings.showCopyToast;
    var copyTextToClipboard = shareSettings.copyTextToClipboard;
    var normalizePublicUrl = shareSettings.normalizePublicUrl;
    var buildNotePublicUrl = shareSettings.buildNotePublicUrl;
    var buildFolderPublicUrl = shareSettings.buildFolderPublicUrl;

    function blurAfterPointerActivation(element, event) {
        if (!element || typeof element.blur !== 'function') return;
        if (event && event.detail === 0) return;

        element.blur();
        window.setTimeout(function() {
            if (document.activeElement === element) {
                element.blur();
            }
        }, 0);
    }

    // ========== State ==========

    var sharedNotes = [];
    var sharedFolders = [];
    var sharedWithMe = [];
    var allItems = [];
    var filteredItems = [];
    var filterText = '';
    var sharedFolderLookup = {};
    var COLLAPSED_FOLDERS_STORAGE_KEY = 'poznote.shared.collapsedFolders';
    var currentHierarchyBranchMeta = {};
    var currentCollapsibleFolderIds = [];
    var collapsedFolderIds = loadCollapsedFolderIds();
    var SORT_STORAGE_KEY = 'poznote.shared.sort';
    var SORT_MODES = ['name', 'updated', 'shared'];
    var sortMode = loadSortMode();

    function loadSortMode() {
        try {
            var stored = window.localStorage ? window.localStorage.getItem(SORT_STORAGE_KEY) : null;
            return SORT_MODES.indexOf(stored) !== -1 ? stored : 'name';
        } catch (error) {
            return 'name';
        }
    }

    function saveSortMode() {
        try {
            if (window.localStorage) {
                window.localStorage.setItem(SORT_STORAGE_KEY, sortMode);
            }
        } catch (error) {
            // Ignore storage failures and keep the UI functional.
            console.debug('shared-page: saveSortMode() failed:', error);
        }
    }

    function loadCollapsedFolderIds() {
        try {
            var stored = window.localStorage ? window.localStorage.getItem(COLLAPSED_FOLDERS_STORAGE_KEY) : null;
            var parsed = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(parsed)) {
                return {};
            }

            return parsed.reduce(function(accumulator, folderId) {
                accumulator[String(folderId)] = true;
                return accumulator;
            }, {});
        } catch (error) {
            return {};
        }
    }

    function saveCollapsedFolderIds() {
        try {
            if (!window.localStorage) {
                return;
            }

            window.localStorage.setItem(COLLAPSED_FOLDERS_STORAGE_KEY, JSON.stringify(Object.keys(collapsedFolderIds)));
        } catch (error) {
            // Ignore storage failures and keep the UI functional.
            console.debug('shared-page: saveCollapsedFolderIds() failed:', error);
        }
    }

    function isFolderCollapsed(folderId) {
        return !!collapsedFolderIds[String(folderId)];
    }

    function setFolderCollapsed(folderId, collapsed) {
        var folderKey = String(folderId);

        if (collapsed) {
            collapsedFolderIds[folderKey] = true;
        } else {
            delete collapsedFolderIds[folderKey];
        }

        saveCollapsedFolderIds();
    }

    function toggleFolderCollapsed(folderId) {
        setFolderCollapsed(folderId, !isFolderCollapsed(folderId));
        renderItems();
    }

    function pruneCollapsedFolderIds() {
        var validFolderIds = {};
        var changed = false;

        sharedFolders.forEach(function(folder) {
            validFolderIds[String(folder.folder_id)] = true;
        });

        Object.keys(collapsedFolderIds).forEach(function(folderId) {
            if (!validFolderIds[folderId]) {
                delete collapsedFolderIds[folderId];
                changed = true;
            }
        });

        if (changed) {
            saveCollapsedFolderIds();
        }
    }

    function buildEditModalOptions(item) {
        if (!item) return null;

        if (item._type === 'note') {
            var noteHasPassword = !!Number(item.hasPassword);

            return {
                itemId: item.note_id,
                token: item.token,
                itemType: 'note',
                noteType: item.type,
                protocol: getPreferredPublicUrlProtocol(),
                accessMode: item.access_mode || 'full',
                indexable: !!Number(item.indexable),
                hasPassword: noteHasPassword,
                passwordValue: item.passwordValue || '',
                allowedUsers: item.allowed_users || null,
                revoke: {
                    isDisabled: !!item.disabled,
                    onDeleted: loadSharedNotes,
                    onToggled: loadSharedNotes
                },
                onSave: function(updates) {
                    return updateNoteShareSettings(item.note_id, updates);
                }
            };
        }

        if (item._type === 'folder') {
            var folderHasPassword = !!Number(item.password);

            return {
                itemId: item.folder_id,
                token: item.token,
                itemType: 'folder',
                protocol: getPreferredPublicUrlProtocol(),
                accessMode: item.access_mode || 'read_only',
                indexable: !!Number(item.indexable),
                hasPassword: folderHasPassword,
                passwordValue: item.passwordValue || '',
                allowedUsers: item.allowed_users || null,
                // A folder shared through its parent has no share of its own
                revoke: item.is_direct ? {
                    isDisabled: !!item.disabled,
                    onDeleted: loadSharedNotes,
                    onToggled: loadSharedNotes
                } : null,
                onSave: function(updates) {
                    return updateFolderShareSettings(item.folder_id, updates);
                }
            };
        }

        return null;
    }

    function openEditModalForItem(item) {
        var modalOptions = buildEditModalOptions(item);
        if (modalOptions) {
            modalOptions.onTokenChanged = function(oldToken, newToken) {
                if (syncFilterWithUpdatedToken(oldToken, newToken)) {
                    applyFilter();
                }
            };
            shareSettings.show(modalOptions);
        }
    }

    // ========== Navigation ==========

    function goBackToNotes() {
        var params = new URLSearchParams();
        if (config.workspace) params.append('workspace', config.workspace);
        window.location.href = 'index.php' + (params.toString() ? '?' + params.toString() : '');
    }

    // ========== Filter ==========

    function updateClearButton() {
        var clearBtn = document.getElementById('clearFilterBtn');
        if (clearBtn) {
            clearBtn.style.display = filterText ? 'flex' : 'none';
        }
    }

    function syncFilterWithUpdatedToken(oldToken, newToken) {
        if (!oldToken || !newToken) return false;

        var currentFilter = (filterText || '').trim().toLowerCase();
        if (currentFilter !== String(oldToken).trim().toLowerCase()) return false;

        filterText = newToken.trim().toLowerCase();

        var filterInput = document.getElementById('filterInput');
        if (filterInput) {
            filterInput.value = newToken;
        }

        updateClearButton();
        return true;
    }

    function applyFilter() {
        filteredItems = allItems.filter(function(item) {
            if (!filterText) return true;
            if (item._type === 'shared_with_me_note') {
                return (item.heading || '').toLowerCase().includes(filterText) || (item.owner_name || '').toLowerCase().includes(filterText) || (item.token || '').toLowerCase().includes(filterText);
            }
            if (item._type === 'shared_with_me_folder') {
                return (item.folder_name || '').toLowerCase().includes(filterText) || (item.owner_name || '').toLowerCase().includes(filterText) || (item.token || '').toLowerCase().includes(filterText);
            }
            if (item._type === 'note') {
                var heading = (item.heading || '').toLowerCase();
                var token = (item.token || '').toLowerCase();
                var folderName = (item.shared_folder_name || '').toLowerCase();
                var folderPath = (item.folder_path || '').toLowerCase();
                return heading.includes(filterText) || token.includes(filterText) || folderName.includes(filterText) || folderPath.includes(filterText);
            } else {
                var name = (item.folder_name || '').toLowerCase();
                var path = (item.folder_path || '').toLowerCase();
                var tok = (item.token || '').toLowerCase();
                return name.includes(filterText) || path.includes(filterText) || tok.includes(filterText);
            }
        });
        renderItems();
    }

    function syncUrl() {
        var params = new URLSearchParams(window.location.search);
        if (filterText) {
            params.set('filter', filterText);
        } else {
            params.delete('filter');
        }
        // Left over from the type buttons (All / Notes / Folders / Shared with me), now gone
        params.delete('type');
        // Keep non-filter params (workspace, etc.) intact
        var newSearch = params.toString();
        var newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
        window.history.replaceState(null, '', newUrl);
    }

    // ========== Data loading ==========

    function mergeItems() {
        allItems = [];
        sharedFolderLookup = {};
        sharedFolders.forEach(function(folder) {
            folder.public_url = normalizePublicUrl(folder.public_url || buildFolderPublicUrl(folder.token || ''));
            sharedFolderLookup[String(folder.folder_id)] = folder;
        });
        sharedNotes.forEach(function(note) {
            note.url = normalizePublicUrl(note.url);
            note._type = 'note';
            allItems.push(note);
        });
        sharedFolders.forEach(function(folder) { folder._type = 'folder'; allItems.push(folder); });
        sharedWithMe.forEach(function(item) {
            item.url = normalizePublicUrl(item.url);
            allItems.push(item);
        });
        pruneCollapsedFolderIds();
    }

    function propagateInheritedFolderAllowedUsers(folderId, allowedUsers) {
        var childrenByParentId = {};
        var normalizedAllowedUsers = Array.isArray(allowedUsers) && allowedUsers.length > 0
            ? allowedUsers.slice()
            : null;

        sharedFolders.forEach(function(folder) {
            var parentKey = folder.parent_id != null ? String(folder.parent_id) : '';
            if (!childrenByParentId[parentKey]) {
                childrenByParentId[parentKey] = [];
            }
            childrenByParentId[parentKey].push(folder);
        });

        function updateDescendants(parentKey) {
            (childrenByParentId[parentKey] || []).forEach(function(childFolder) {
                if (childFolder.is_direct) {
                    return;
                }

                childFolder.allowed_users = normalizedAllowedUsers ? normalizedAllowedUsers.slice() : null;
                updateDescendants(String(childFolder.folder_id));
            });
        }

        updateDescendants(String(folderId));
    }

    function propagateInheritedFolderPasswordState(folderId, hasPassword, passwordValue) {
        var childrenByParentId = {};
        var normalizedHasPassword = !!Number(hasPassword);
        var normalizedPasswordValue = normalizedHasPassword ? (passwordValue || '') : '';
        var effectiveFolderPasswordById = {};

        sharedFolders.forEach(function(folder) {
            var parentKey = folder.parent_id != null ? String(folder.parent_id) : '';
            if (!childrenByParentId[parentKey]) {
                childrenByParentId[parentKey] = [];
            }
            childrenByParentId[parentKey].push(folder);
        });

        function updateDescendants(parentKey) {
            (childrenByParentId[parentKey] || []).forEach(function(childFolder) {
                if (childFolder.is_direct) {
                    return;
                }

                childFolder.password = normalizedHasPassword ? 1 : 0;
                childFolder.passwordValue = normalizedPasswordValue;
                updateDescendants(String(childFolder.folder_id));
            });
        }

        updateDescendants(String(folderId));

        sharedFolders.forEach(function(folder) {
            effectiveFolderPasswordById[String(folder.folder_id)] = !!Number(folder.password);
        });

        sharedNotes.forEach(function(note) {
            var noteFolderId = note && note.folder_id != null ? String(note.folder_id) : '';
            if (!note.shared_via_folder || !noteFolderId || !Object.prototype.hasOwnProperty.call(effectiveFolderPasswordById, noteFolderId)) {
                return;
            }

            note.shared_folder_has_password = effectiveFolderPasswordById[noteFolderId];
        });
    }

    function getItemSortName(item) {
        if (item._type === 'folder') {
            return (item.folder_path || item.folder_name || '').toLowerCase();
        }
        return (item.heading || item.folder_name || config.txtUntitled).toLowerCase();
    }

    function getItemSortDate(item) {
        if (sortMode === 'updated') {
            return item.updated || '';
        }
        return item.shared_date || item.created || '';
    }

    // Dates come newest first; an item without the date goes after the others,
    // and ties fall back on the name.
    function compareItems(a, b) {
        if (sortMode !== 'name') {
            var dateA = getItemSortDate(a);
            var dateB = getItemSortDate(b);
            if (dateA !== dateB) {
                return dateA < dateB ? 1 : -1;
            }
        }
        return getItemSortName(a).localeCompare(getItemSortName(b));
    }

    function buildAllViewSequence(items) {
        var folders = [];
        var notes = [];
        var standaloneNotes = [];
        var notesByFolderId = {};
        var foldersByParentId = {};
        var foldersById = {};
        var orderedItems = [];

        items.forEach(function(item) {
            if (item && item._type === 'note') {
                delete item._renderAsChildOfFolderId;
                delete item._hierarchyDepth;
            }

            if (item && item._type === 'folder') {
                delete item._hierarchyDepth;
            }

            if (item._type === 'folder') {
                folders.push(item);
                return;
            }

            if (item._type === 'note') {
                notes.push(item);
                return;
            }

            orderedItems.push(item);
        });

        orderedItems.sort(compareItems);
        folders.sort(compareItems);
        notes.sort(compareItems);

        notes.forEach(function(note) {
            var folderId = note.folder_id != null ? String(note.folder_id) : '';
            if (!folderId) {
                standaloneNotes.push(note);
                return;
            }

            if (!notesByFolderId[folderId]) {
                notesByFolderId[folderId] = [];
            }
            notesByFolderId[folderId].push(note);
        });

        folders.forEach(function(folder) {
            var folderKey = String(folder.folder_id);
            var parentKey = folder.parent_id != null ? String(folder.parent_id) : '';
            foldersById[folderKey] = folder;
            if (!foldersByParentId[parentKey]) {
                foldersByParentId[parentKey] = [];
            }
            foldersByParentId[parentKey].push(folder);
        });

        function appendFolderBranch(folder, depth) {
            var folderKey = String(folder.folder_id);
            folder._hierarchyDepth = depth;
            orderedItems.push(folder);

            (notesByFolderId[folderKey] || []).forEach(function(note) {
                note._renderAsChildOfFolderId = folder.folder_id;
                note._hierarchyDepth = depth + 1;
                orderedItems.push(note);
            });
            delete notesByFolderId[folderKey];

            (foldersByParentId[folderKey] || []).forEach(function(childFolder) {
                appendFolderBranch(childFolder, depth + 1);
            });
        }

        folders.forEach(function(folder) {
            var parentKey = folder.parent_id != null ? String(folder.parent_id) : '';
            if (!parentKey || !foldersById[parentKey]) {
                appendFolderBranch(folder, 0);
            }
        });

        Object.keys(notesByFolderId).forEach(function(folderKey) {
            standaloneNotes = standaloneNotes.concat(notesByFolderId[folderKey]);
        });

        standaloneNotes.sort(compareItems);

        standaloneNotes.forEach(function(note) {
            delete note._renderAsChildOfFolderId;
            delete note._hierarchyDepth;
            orderedItems.push(note);
        });

        return orderedItems;
    }

    function getHierarchyDepth(item) {
        var depth = parseInt(item && item._hierarchyDepth, 10);
        return Number.isFinite(depth) && depth > 0 ? depth : 0;
    }

    function buildHierarchyPresentation(items) {
        var branchMeta = {};
        var ancestorStack = [];
        var collapseEnabled = !filterText;
        var visibleItems = [];
        var collapsedStack = [];

        items.forEach(function(item) {
            var depth = getHierarchyDepth(item);

            while (ancestorStack.length > depth) {
                ancestorStack.pop();
            }

            ancestorStack.forEach(function(folderId) {
                if (branchMeta[folderId]) {
                    branchMeta[folderId].descendantCount += 1;
                }
            });

            if (item && item._type === 'folder') {
                var folderKey = String(item.folder_id);
                branchMeta[folderKey] = {
                    descendantCount: 0,
                    depth: depth
                };
                ancestorStack[depth] = folderKey;
                ancestorStack.length = depth + 1;
            }
        });

        items.forEach(function(item) {
            var depth = getHierarchyDepth(item);

            while (collapsedStack.length > 0 && depth <= collapsedStack[collapsedStack.length - 1].depth) {
                collapsedStack.pop();
            }

            if (!collapseEnabled || collapsedStack.length === 0) {
                visibleItems.push(item);
            }

            if (collapseEnabled && item && item._type === 'folder') {
                var folderKey = String(item.folder_id);
                var branchInfo = branchMeta[folderKey];
                if (branchInfo && branchInfo.descendantCount > 0 && isFolderCollapsed(folderKey)) {
                    collapsedStack.push({
                        folderId: folderKey,
                        depth: depth
                    });
                }
            }
        });

        return {
            branchMeta: branchMeta,
            collapsibleFolderIds: Object.keys(branchMeta).filter(function(folderKey) {
                return branchMeta[folderKey].descendantCount > 0;
            }),
            visibleItems: collapseEnabled ? visibleItems : items.slice(),
            searchExpanded: !collapseEnabled && !!filterText
        };
    }

    function applyHierarchyDepth(element, depth, isChildNote) {
        var normalizedDepth = Number.isFinite(depth) && depth > 0 ? depth : 0;
        element.style.setProperty('--shared-indent-level', String(normalizedDepth));
        if (normalizedDepth > 0) {
            element.classList.add('shared-hierarchy-item');
        } else {
            element.classList.remove('shared-hierarchy-item');
        }

        if (isChildNote) {
            element.classList.add('shared-note-child');
        }
    }

    function loadSharedNotes() {
        var spinner = document.getElementById('loadingSpinner');
        var container = document.getElementById('sharedItemsContainer');
        var emptyMessage = document.getElementById('emptyMessage');
        var filterBar = document.getElementById('sharedFilterBar');

        if (spinner) spinner.style.display = 'block';
        if (container) container.innerHTML = '';
        if (emptyMessage) emptyMessage.style.display = 'none';

        sharedFolders = window.__sharedFoldersData || [];

        var params = new URLSearchParams();
        if (config.workspace) params.append('workspace', config.workspace);

        fetch('api/v1/shared?' + params.toString())
            .then(function(response) {
                if (!response.ok) {
                    // Prefer the message the server sent over a bare status code.
                    return response.json()
                        .catch(function () { return {}; })
                        .then(function (data) {
                            throw new Error(data.error || data.message || 'HTTP error! status: ' + response.status);
                        });
                }
                return response.json();
            })
            .then(function(data) {
                if (data.error) throw new Error(data.error);
                sharedFolders = data.shared_folders || [];
                sharedNotes = data.shared_notes || [];
                return fetch('api/v1/shared/with-me');
            })
            .then(function(response) {
                if (!response.ok) {
                    // Prefer the message the server sent over a bare status code.
                    return response.json()
                        .catch(function () { return {}; })
                        .then(function (data) {
                            throw new Error(data.error || data.message || 'HTTP error! status: ' + response.status);
                        });
                }
                return response.json();
            })
            .then(function(data) {
                sharedWithMe = data.items || [];
                if (spinner) spinner.style.display = 'none';
                mergeItems();
                if (filterBar) filterBar.classList.toggle('initially-hidden', allItems.length === 0);
                if (allItems.length === 0) {
                    if (emptyMessage) emptyMessage.style.display = 'block';
                    return;
                }
                applyFilter();
            })
            .catch(function(error) {
                if (spinner) spinner.style.display = 'none';
                if (container) {
                    var errDiv = document.createElement('div');
                    errDiv.className = 'error-message';
                    errDiv.textContent = config.txtError + ': ' + error.message;
                    container.innerHTML = '';
                    container.appendChild(errDiv);
                }
            });
    }

    // ========== Note API actions ==========

    function revokeNoteShare(noteId) {
        shareSettings.deleteShare('note', noteId)
            .then(function() { loadSharedNotes(); })
            .catch(function(error) { showShareToast(config.txtError + ': ' + error.message); });
    }

    function setNoteShareDisabled(noteId, disabled) {
        shareSettings.setShareDisabled('note', noteId, disabled)
            .then(function() { loadSharedNotes(); })
            .catch(function(error) { showShareToast(config.txtError + ': ' + error.message); });
    }

    function updateNoteShareSettings(noteId, updates) {
        return shareSettings.patchNoteShare(noteId, updates)
        .then(function(data) {
            var idx = sharedNotes.findIndex(function(n) { return n.note_id == noteId; });
            if (idx !== -1) {
                if (Object.prototype.hasOwnProperty.call(updates, 'custom_token') && updates.custom_token) {
                    sharedNotes[idx].token = updates.custom_token;
                    sharedNotes[idx].url = buildNotePublicUrl(updates.custom_token);
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'indexable')) {
                    sharedNotes[idx].indexable = updates.indexable ? 1 : 0;
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'access_mode')) {
                    sharedNotes[idx].access_mode = updates.access_mode;
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'password') && updates.password !== undefined) {
                    sharedNotes[idx].hasPassword = data.hasPassword ? 1 : 0;
                    sharedNotes[idx].passwordValue = data.passwordValue || '';
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'allowed_users') && updates.allowed_users !== undefined) {
                    sharedNotes[idx].allowed_users = updates.allowed_users;
                }
            }
            mergeItems();
            applyFilter();
            return data;
        });
    }

    // ========== Folder API actions ==========

    function revokeFolderShare(folderId) {
        shareSettings.deleteShare('folder', folderId)
            .then(function() { loadSharedNotes(); })
            .catch(function(error) { showShareToast(config.txtError + ': ' + error.message); });
    }

    function setFolderShareDisabled(folderId, disabled) {
        shareSettings.setShareDisabled('folder', folderId, disabled)
            .then(function() { loadSharedNotes(); })
            .catch(function(error) { showShareToast(config.txtError + ': ' + error.message); });
    }

    function updateFolderShareSettings(folderId, updates) {
        return shareSettings.patchFolderShare(folderId, updates)
        .then(function(data) {
            var folder = sharedFolders.find(function(f) { return f.folder_id == folderId; });
            if (folder) {
                if (Object.prototype.hasOwnProperty.call(updates, 'custom_token') && updates.custom_token) {
                    folder.token = updates.custom_token;
                    folder.public_url = buildFolderPublicUrl(updates.custom_token);
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'indexable')) {
                    folder.indexable = updates.indexable ? 1 : 0;
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'access_mode') && updates.access_mode !== undefined) {
                    folder.access_mode = data.accessMode || updates.access_mode;
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'password') && updates.password !== undefined) {
                    folder.password = data.hasPassword ? 1 : 0;
                    folder.passwordValue = data.passwordValue || '';
                    propagateInheritedFolderPasswordState(folderId, folder.password, folder.passwordValue);
                }
                if (Object.prototype.hasOwnProperty.call(updates, 'allowed_users') && updates.allowed_users !== undefined) {
                    folder.allowed_users = Array.isArray(data.allowed_users) ? data.allowed_users.slice() : null;
                    propagateInheritedFolderAllowedUsers(folderId, folder.allowed_users);
                }
            }
            mergeItems();
            applyFilter();
            return data;
        });
    }

    // ========== UI Helpers ==========

    function shouldExpandAllFolders() {
        return currentCollapsibleFolderIds.some(function(folderId) {
            return isFolderCollapsed(folderId);
        });
    }

    // The button is only shown when the tree has folders to fold
    function updateTreeToolbar(presentation) {
        var toolbar = document.getElementById('sharedTreeToolbar');
        var searchHint = document.getElementById('sharedTreeSearchHint');
        var toggleBtn = document.getElementById('toggleAllFoldersBtn');
        var showToolbar = !!(presentation && presentation.collapsibleFolderIds.length > 0);

        currentHierarchyBranchMeta = presentation ? presentation.branchMeta : {};
        currentCollapsibleFolderIds = presentation ? presentation.collapsibleFolderIds.slice() : [];

        if (!toolbar) {
            return;
        }

        if (!showToolbar) {
            toolbar.classList.add('initially-hidden');
            if (toggleBtn) toggleBtn.disabled = true;
            if (searchHint) searchHint.classList.add('initially-hidden');
            return;
        }

        toolbar.classList.remove('initially-hidden');

        if (searchHint) {
            searchHint.classList.toggle('initially-hidden', !presentation.searchExpanded);
        }

        if (toggleBtn) {
            var shouldExpand = shouldExpandAllFolders();
            var label = shouldExpand ? config.txtExpandAll : config.txtCollapseAll;
            var labelEl = document.getElementById('toggleAllFoldersLabel');
            var icon = toggleBtn.querySelector('.lucide');

            toggleBtn.disabled = presentation.searchExpanded;
            toggleBtn.setAttribute('aria-expanded', shouldExpand ? 'false' : 'true');
            if (labelEl) {
                labelEl.textContent = label;
            }
            // The button shows its chevron alone: the label goes to its tooltip
            toggleBtn.title = label;
            toggleBtn.setAttribute('aria-label', label);
            if (icon) {
                icon.classList.toggle('lucide-chevron-down', shouldExpand);
                icon.classList.toggle('lucide-chevron-up', !shouldExpand);
            }
        }
    }

    function expandAllFolders() {
        var changed = false;

        if (filterText) {
            return;
        }

        currentCollapsibleFolderIds.forEach(function(folderId) {
            if (isFolderCollapsed(folderId)) {
                delete collapsedFolderIds[String(folderId)];
                changed = true;
            }
        });

        if (changed) {
            saveCollapsedFolderIds();
            renderItems();
        }
    }

    function collapseAllFolders() {
        var changed = false;

        if (filterText) {
            return;
        }

        currentCollapsibleFolderIds.forEach(function(folderId) {
            if (!isFolderCollapsed(folderId)) {
                collapsedFolderIds[String(folderId)] = true;
                changed = true;
            }
        });

        if (changed) {
            saveCollapsedFolderIds();
            renderItems();
        }
    }

    function copyItemUrl(url) {
        return copyTextToClipboard(url).then(function() {
            showCopyToast(getConfig().txtUrlCopied);
        }).catch(function() {
            window.prompt('Copy this URL', url);
        });
    }

    function renderTokenCell(token, fallbackText) {
        var wrapper = document.createElement('div');
        wrapper.className = 'note-token-wrap read-only';

        var content = document.createElement('span');
        content.className = 'note-token' + (token ? '' : ' read-only');

        if (token) {
            content.textContent = token;
            content.title = token;
        } else {
            content.textContent = fallbackText || '';
            content.title = fallbackText || '';
            content.style.fontStyle = 'italic';
        }

        wrapper.appendChild(content);
        return wrapper;
    }

    // ========== Rendering ==========

    function renderItems() {
        var container = document.getElementById('sharedItemsContainer');
        var emptyMessage = document.getElementById('emptyMessage');
        if (!container) return;
        container.innerHTML = '';

        if (filteredItems.length === 0) {
            if (emptyMessage) emptyMessage.style.display = 'none';
            if (filterText) {
                var noResultsDiv = document.createElement('div');
                noResultsDiv.className = 'empty-message';
                noResultsDiv.innerHTML = '<p>' + config.txtNoFilterResults + '</p>';
                container.appendChild(noResultsDiv);
            } else if (emptyMessage) {
                emptyMessage.style.display = 'block';
            }
            return;
        }

        if (emptyMessage) emptyMessage.style.display = 'none';

        var list = document.createElement('div');
        list.className = 'shared-notes-list';

        var header = document.createElement('div');
        header.className = 'shared-notes-header';

        var headerName = document.createElement('div');
        headerName.className = 'shared-notes-header-cell shared-notes-header-note';
        headerName.textContent = config.txtTableName;
        header.appendChild(headerName);

        var headerUrl = document.createElement('div');
        headerUrl.className = 'shared-notes-header-cell shared-notes-header-token';

        var headerTokenLabel = document.createElement('span');
        headerTokenLabel.textContent = config.txtTableToken;
        headerUrl.appendChild(headerTokenLabel);

        var tokenHelp = document.createElement('span');
        tokenHelp.className = 'shared-header-help';
        tokenHelp.tabIndex = 0;
        tokenHelp.setAttribute('role', 'button');
        tokenHelp.setAttribute('aria-label', config.txtTokenHelp);
        tokenHelp.innerHTML = '<i class="lucide lucide-help-circle"></i>';

        var tokenHelpTooltip = document.createElement('span');
        tokenHelpTooltip.className = 'shared-header-help-tooltip';
        tokenHelpTooltip.textContent = config.txtTokenHelp;
        tokenHelp.appendChild(tokenHelpTooltip);

        headerUrl.appendChild(tokenHelp);
        header.appendChild(headerUrl);

        var headerActions = document.createElement('div');
        headerActions.className = 'shared-notes-header-cell shared-notes-header-actions';
        headerActions.textContent = config.txtTableActions;
        header.appendChild(headerActions);

        list.appendChild(header);

        var hierarchyPresentation = buildHierarchyPresentation(buildAllViewSequence(filteredItems));
        updateTreeToolbar(hierarchyPresentation);

        hierarchyPresentation.visibleItems.forEach(function(item) {
            if (item._type === 'note') {
                list.appendChild(renderNoteItem(item));
            } else if (item._type === 'shared_with_me_note' || item._type === 'shared_with_me_folder') {
                list.appendChild(renderSharedWithMeItem(item));
            } else {
                list.appendChild(renderFolderItem(item));
            }
        });

        container.appendChild(list);
        adjustSharedColumnWidths();
    }

    // Content-adaptive columns: after each render, the NAME, PATH/FOLDER and
    // LINK columns are sized to their longest rendered content (the actions
    // column stays fixed). When the three of them cannot fit the list width,
    // they are scaled back proportionally; long paths then wrap and long
    // names/links fall back to their ellipsis.
    function adjustSharedColumnWidths() {
        var list = document.querySelector('#sharedItemsContainer .shared-notes-list');
        if (!list) return;

        if (window.innerWidth <= 800) {
            list.style.removeProperty('--shared-name-width');
            list.style.removeProperty('--shared-token-width');
            list.style.removeProperty('--shared-actions-width');
            list.style.removeProperty('width');
            return;
        }

        // The list is later shrunk to the columns' total width; the budget
        // must come from its natural width, so drop the inline one first.
        list.style.removeProperty('width');

        function maxCellWidth(selector) {
            var max = 0;
            list.querySelectorAll(selector).forEach(function(cell) {
                var w = cell.getBoundingClientRect().width;
                if (w > max) max = w;
            });
            return Math.ceil(max);
        }

        list.classList.add('shared-measure');
        var nameW = maxCellWidth('.shared-notes-header-note, .note-name-container');
        var tokenW = maxCellWidth('.shared-notes-header-token, .note-token-wrap');
        var actionsW = maxCellWidth('.shared-notes-header-actions, .note-actions');
        list.classList.remove('shared-measure');

        var styles = getComputedStyle(list);
        var gap = parseFloat(styles.getPropertyValue('--shared-column-gap')) || 16;

        // The actions column hugs its content and never shrinks below it:
        // buttons cannot wrap or ellipsize. Name and link absorb the squeeze.
        var actionsColW = Math.max(actionsW + 2, 120);
        var mins = [180, 160, actionsColW];
        var widths = [
            Math.max(nameW + 2, mins[0]),
            Math.max(tokenW + 2, mins[1]),
            actionsColW
        ];

        // Row padding (5px each side) plus a small buffer keeps the widest row
        // from overflowing the list once the gaps are added. clientWidth
        // includes the card's own padding: subtract it, the columns live in
        // the content box.
        var padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
        var available = list.clientWidth - padX - gap * 2 - 12;

        // When the content widths do not fit, each column gives up part of its
        // slack above its minimum, proportionally to that slack. A few passes
        // converge; below the minimums the row overflows like it always did.
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

        // Shrink the list to the columns' total width so every column hugs
        // its content and the table stays centered (margin: 0 auto).
        list.style.width = (widths[0] + widths[1] + widths[2] + gap * 2 + 12) + 'px';
    }

    function noteHasVisiblePasswordProtection(note) {
        return !!Number(note && note.hasPassword) || !!note.shared_folder_has_password;
    }

    function hasRestrictedAllowedUsers(allowedUsers) {
        return Array.isArray(allowedUsers) && allowedUsers.length > 0;
    }

    function getSharedFolderShareById(folderId) {
        if (folderId === null || folderId === undefined) {
            return null;
        }

        return sharedFolderLookup[String(folderId)] || null;
    }

    function noteHasVisibleRestriction(note) {
        if (!note) {
            return false;
        }

        if (hasRestrictedAllowedUsers(note.allowed_users)) {
            return true;
        }

        if (!note.share_id && note.shared_via_folder) {
            var sharedFolder = getSharedFolderShareById(note.folder_id);
            return !!(sharedFolder && hasRestrictedAllowedUsers(sharedFolder.allowed_users));
        }

        return false;
    }

    function folderHasVisibleRestriction(folder) {
        return hasRestrictedAllowedUsers(folder && folder.allowed_users);
    }

    function sharedItemHasVisibleRestriction(sharedItem) {
        return !!sharedItem && (sharedItem._type === 'shared_with_me_note' || sharedItem._type === 'shared_with_me_folder');
    }

    function appendDisabledIndicator(container) {
        var disabledIcon = document.createElement('i');
        disabledIcon.className = 'lucide lucide-eye-off shared-disabled-icon';
        disabledIcon.style.marginLeft = '6px';
        disabledIcon.style.fontSize = '14px';
        disabledIcon.style.opacity = '1';
        disabledIcon.title = config.txtShareDisabledHelp || config.txtShareDisabledBadge;
        disabledIcon.setAttribute('aria-label', config.txtShareDisabledHelp || config.txtShareDisabledBadge);
        container.appendChild(disabledIcon);
    }

    function appendRestrictedIndicator(container) {
        var restrictedIcon = document.createElement('i');
        restrictedIcon.className = 'lucide lucide-shield shared-restricted-icon';
        restrictedIcon.classList.add('is-restricted');
        restrictedIcon.style.marginLeft = '6px';
        restrictedIcon.style.fontSize = '14px';
        restrictedIcon.style.opacity = '1';
        restrictedIcon.title = config.txtRestrictedHelp || config.txtRestrictedBadge;
        restrictedIcon.setAttribute('aria-label', config.txtRestrictedHelp || config.txtRestrictedBadge);
        container.appendChild(restrictedIcon);
    }

    function renderNoteItem(note) {
        var item = document.createElement('div');
        item.className = 'shared-item shared-note-item';
        item.dataset.noteId = note.note_id;
        item.dataset.itemType = 'note';
        if (note._renderAsChildOfFolderId) {
            item.dataset.parentFolderId = String(note._renderAsChildOfFolderId);
        }
        applyHierarchyDepth(item, note._hierarchyDepth || 0, Boolean(note._renderAsChildOfFolderId));

        var nameContainer = document.createElement('div');
        nameContainer.className = 'note-name-container';

        var typeIcon = document.createElement('i');
        var noteIconClass = (note.icon && note.icon !== 'lucide-sticky-note') ? note.icon : 'lucide-sticky-note';
        typeIcon.className = 'lucide ' + noteIconClass + ' note-icon shared-type-icon';
        if (note.icon_color) {
            typeIcon.style.setProperty('color', window.poznoteIconColorCss ? window.poznoteIconColorCss(note.icon_color) : note.icon_color, 'important');
            typeIcon.setAttribute('data-icon-color', note.icon_color);
        }
        nameContainer.appendChild(typeIcon);

        var noteLink = document.createElement('a');
        noteLink.href = 'index.php?note=' + note.note_id + (config.workspace ? '&workspace=' + encodeURIComponent(config.workspace) : '');
        noteLink.textContent = note.heading || config.txtUntitled;
        noteLink.className = 'note-name';
        // The PATH/FOLDER column is gone: keep the path reachable on hover.
        if (note.folder_path && note.folder_path !== 'Default') {
            noteLink.title = note.shared_via_folder
                ? (config.txtViaFolder + ': ' + note.folder_path)
                : note.folder_path;
        }
        nameContainer.appendChild(noteLink);

        if (noteHasVisiblePasswordProtection(note)) {
            var lockIcon = document.createElement('i');
            lockIcon.className = 'lucide lucide-lock shared-password-icon';
            lockIcon.style.marginLeft = '6px';
            lockIcon.style.fontSize = '14px';
            lockIcon.classList.add('is-password-protected'); // Add CSS class for styling
            lockIcon.style.opacity = '1';
            lockIcon.title = config.txtPasswordLabel;
            nameContainer.appendChild(lockIcon);
        }

        if (noteHasVisibleRestriction(note)) {
            appendRestrictedIndicator(nameContainer);
        }

        // A note is flagged inaccessible when its own share (or its own
        // per-note block, for notes reached through a folder) is disabled,
        // or when the folder share it depends on is disabled as a whole.
        var noteShareDisabled = !!note.disabled
            || (!note.share_id && note.shared_via_folder && !!note.shared_folder_disabled);
        if (noteShareDisabled) {
            appendDisabledIndicator(nameContainer);
            item.classList.add('is-share-disabled');
        }

        item.appendChild(nameContainer);

        item.appendChild(renderTokenCell(note.token, ''));

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'note-actions';

        // A note shared only through a folder gets the same open / copy /
        // revoke actions as a direct share (its URL goes through the folder
        // token, and revoke targets that folder share). Only the token edit
        // button stays reserved for direct shares.
        if (note.share_id || note.shared_via_folder) {
            var openBtn = document.createElement('button');
            openBtn.className = 'btn btn-sm btn-success';
            openBtn.innerHTML = '<i class="lucide lucide-external-link"></i>';
            openBtn.title = config.txtOpen;
            (function(noteUrl) {
                openBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var normalizedUrl = applyProtocolToPublicUrl(normalizePublicUrl(noteUrl), getPreferredPublicUrlProtocol());
                    window.open(normalizedUrl, '_blank', 'noopener');
                });
            })(note.url);
            actionsDiv.appendChild(openBtn);

            if (note.share_id) {
                var editTokenBtn = document.createElement('button');
                editTokenBtn.className = 'btn btn-sm btn-primary';
                editTokenBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
                editTokenBtn.title = config.txtEditToken;
                (function(noteRef) {
                    editTokenBtn.addEventListener('click', function() {
                        openEditModalForItem(noteRef);
                    });
                })(note);
                actionsDiv.appendChild(editTokenBtn);
            } else {
                // A note shared through a folder has no token of its own to
                // edit: the button is shown greyed out to keep the action
                // rows aligned, with a tooltip explaining why.
                var editTokenBtnDisabled = document.createElement('button');
                editTokenBtnDisabled.className = 'btn btn-sm btn-primary';
                editTokenBtnDisabled.disabled = true;
                editTokenBtnDisabled.innerHTML = '<i class="lucide lucide-pencil"></i>';
                editTokenBtnDisabled.title = config.txtNoteSharedThroughFolder;
                actionsDiv.appendChild(editTokenBtnDisabled);
            }

            var copyBtn = document.createElement('button');
            copyBtn.className = 'btn btn-sm btn-primary';
            copyBtn.innerHTML = '<i class="lucide lucide-copy"></i>';
            copyBtn.title = config.txtCopyUrl;
            (function(noteUrl) {
                copyBtn.addEventListener('click', function() {
                    var normalizedUrl = applyProtocolToPublicUrl(normalizePublicUrl(noteUrl), getPreferredPublicUrlProtocol());
                    copyItemUrl(normalizedUrl);
                });
            })(note.url);
            actionsDiv.appendChild(copyBtn);
        }

        if (note.share_id || note.shared_via_folder) {
            // The revoke action only ever targets THIS note: its own share,
            // or, for a note reached through a folder share, a per-note block
            // that leaves the folder share and its other notes untouched.
            // The button's look follows the note's EFFECTIVE accessibility
            // (own block or disabled folder share), like the name badge; the
            // modal and its toggle still act on the note's own state only.
            var revokeBtn = document.createElement('button');
            if (noteShareDisabled) {
                revokeBtn.className = 'btn btn-sm btn-share-disabled';
                revokeBtn.innerHTML = '<i class="lucide lucide-eye-off"></i>';
                revokeBtn.title = config.txtShareDisabledBadge;
            } else {
                revokeBtn.className = 'btn btn-sm btn-danger';
                revokeBtn.innerHTML = '<i class="lucide lucide-ban"></i>';
                revokeBtn.title = config.txtRevoke;
            }
            (function(noteRef, isDisabled) {
                revokeBtn.addEventListener('click', function() {
                    // Already inaccessible through its disabled folder share,
                    // with no block of its own: nothing at note level can
                    // change its accessibility, so the modal only explains.
                    if (!noteRef.share_id && !isDisabled && noteRef.shared_folder_disabled) {
                        showRevokeShareModal({
                            isDisabled: true,
                            text: config.txtRevokeModalTextViaFolderParentDisabled,
                            onDelete: null,
                            onToggle: null
                        });
                        return;
                    }
                    showRevokeShareModal({
                        isDisabled: isDisabled,
                        // Deleting only applies to a note's own share; a note
                        // shared through a folder is toggled, never deleted.
                        onDelete: noteRef.share_id
                            ? function() { revokeNoteShare(noteRef.note_id); }
                            : null,
                        text: noteRef.share_id
                            ? null
                            : (isDisabled ? config.txtRevokeModalTextViaFolderDisabled : config.txtRevokeModalTextViaFolder),
                        onToggle: function(nextDisabled) { setNoteShareDisabled(noteRef.note_id, nextDisabled); }
                    });
                });
            })(note, !!note.disabled);
            actionsDiv.appendChild(revokeBtn);
        }

        item.appendChild(actionsDiv);
        return item;
    }

    function renderFolderItem(folder) {
        var item = document.createElement('div');
        var folderKey = String(folder.folder_id);
        var branchInfo = currentHierarchyBranchMeta[folderKey] || { descendantCount: 0 };
        var isCollapsible = branchInfo.descendantCount > 0;
        var isCollapsed = isCollapsible && !filterText && isFolderCollapsed(folderKey);

        item.className = 'shared-item shared-note-item shared-folder-row';
        item.dataset.folderId = folder.folder_id;
        item.dataset.folderName = folder.folder_name;
        item.dataset.itemType = 'folder';
        item.dataset.hasPassword = folder.password ? '1' : '0';
        item.dataset.collapsible = isCollapsible ? '1' : '0';
        item.dataset.collapsed = isCollapsed ? '1' : '0';
        if (!folder.is_direct) item.classList.add('shared-via-parent');
        if (isCollapsible) item.classList.add('is-collapsible');
        if (isCollapsed) item.classList.add('is-collapsed');
        applyHierarchyDepth(item, folder._hierarchyDepth || 0, false);

        var nameContainer = document.createElement('div');
        nameContainer.className = 'note-name-container';

        var toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = 'shared-folder-toggle' + (isCollapsible ? '' : ' is-placeholder');

        if (isCollapsible) {
            toggleButton.title = isCollapsed ? config.txtExpandFolder : config.txtCollapseFolder;
            toggleButton.setAttribute('aria-label', isCollapsed ? config.txtExpandFolder : config.txtCollapseFolder);
            toggleButton.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            toggleButton.innerHTML = isCollapsed
                ? '<i class="lucide lucide-chevron-right"></i>'
                : '<i class="lucide lucide-chevron-down"></i>';
            (function(folderId) {
                toggleButton.addEventListener('click', function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFolderCollapsed(folderId);
                });
            })(folder.folder_id);
        } else {
            toggleButton.setAttribute('aria-hidden', 'true');
            toggleButton.tabIndex = -1;
            toggleButton.innerHTML = '<span class="shared-folder-toggle-placeholder"></span>';
        }

        nameContainer.appendChild(toggleButton);

        var typeIcon = document.createElement('i');
        var folderIconClass = (folder.icon && folder.icon !== 'lucide-folder') ? folder.icon : 'lucide-folder';
        typeIcon.className = 'lucide ' + folderIconClass + ' folder-icon shared-type-icon';
        if (folder.icon_color) {
            typeIcon.style.setProperty('color', window.poznoteIconColorCss ? window.poznoteIconColorCss(folder.icon_color) : folder.icon_color, 'important');
            typeIcon.setAttribute('data-icon-color', folder.icon_color);
        }
        nameContainer.appendChild(typeIcon);

        var folderLink = document.createElement('a');
        folderLink.href = 'index.php?kanban=' + folder.folder_id + (config.workspace ? '&workspace=' + encodeURIComponent(config.workspace) : '');
        folderLink.className = 'folder-name-path note-name';
        folderLink.title = folder.folder_path;
        folderLink.textContent = folder.folder_name;
        nameContainer.appendChild(folderLink);

        var folderCount = document.createElement('span');
        folderCount.className = 'shared-folder-count';
        folderCount.textContent = String(folder.note_count);
        nameContainer.appendChild(folderCount);

        if (folder.password) {
            var lockIcon = document.createElement('i');
            lockIcon.className = 'lucide lucide-lock shared-password-icon';
            lockIcon.style.marginLeft = '6px';
            lockIcon.style.fontSize = '14px';
            lockIcon.classList.add('is-password-protected'); // Add CSS class for styling
            lockIcon.style.opacity = '1';
            lockIcon.title = config.txtPasswordLabel;
            nameContainer.appendChild(lockIcon);
        }

        if (folderHasVisibleRestriction(folder)) {
            appendRestrictedIndicator(nameContainer);
        }

        if (folder.disabled) {
            appendDisabledIndicator(nameContainer);
            item.classList.add('is-share-disabled');
        }

        item.appendChild(nameContainer);

        item.appendChild(renderTokenCell(folder.token, ''));

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'note-actions';

        if (folder.is_direct) {
            var openBtn = document.createElement('button');
            openBtn.className = 'btn btn-sm btn-success';
            openBtn.innerHTML = '<i class="lucide lucide-external-link"></i>';
            openBtn.title = config.txtOpen;
            (function(folderUrl) {
                openBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var normalizedUrl = applyProtocolToPublicUrl(normalizePublicUrl(folderUrl), getPreferredPublicUrlProtocol());
                    window.open(normalizedUrl, '_blank', 'noopener');
                });
            })(folder.public_url);
            actionsDiv.appendChild(openBtn);

            var editTokenBtn = document.createElement('button');
            editTokenBtn.className = 'btn btn-sm btn-primary';
            editTokenBtn.innerHTML = '<i class="lucide lucide-pencil"></i>';
            editTokenBtn.title = config.txtEditToken;
            (function(folderRef) {
                editTokenBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openEditModalForItem(folderRef);
                });
            })(folder);
            actionsDiv.appendChild(editTokenBtn);

            var copyBtn = document.createElement('button');
            copyBtn.className = 'btn btn-sm btn-primary';
            copyBtn.innerHTML = '<i class="lucide lucide-copy"></i>';
            copyBtn.title = config.txtCopyUrl;
            (function(folderUrl) {
                copyBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var normalizedUrl = applyProtocolToPublicUrl(normalizePublicUrl(folderUrl), getPreferredPublicUrlProtocol());
                    copyItemUrl(normalizedUrl);
                });
            })(folder.public_url);
            actionsDiv.appendChild(copyBtn);
        }

        if (folder.is_direct) {
            var revokeBtn = document.createElement('button');
            if (folder.disabled) {
                revokeBtn.className = 'btn btn-sm btn-share-disabled btn-revoke';
                revokeBtn.innerHTML = '<i class="lucide lucide-eye-off"></i>';
                revokeBtn.title = config.txtShareDisabledBadge;
            } else {
                revokeBtn.className = 'btn btn-sm btn-danger btn-revoke';
                revokeBtn.innerHTML = '<i class="lucide lucide-ban"></i>';
                revokeBtn.title = config.txtRevoke;
            }
            (function(fId, isDisabled) {
                revokeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    showRevokeShareModal({
                        isDisabled: isDisabled,
                        onDelete: function() { revokeFolderShare(fId); },
                        onToggle: function(nextDisabled) { setFolderShareDisabled(fId, nextDisabled); }
                    });
                });
            })(folder.folder_id, !!folder.disabled);
            actionsDiv.appendChild(revokeBtn);
        } else {
            var viaParentText = document.createElement('span');
            viaParentText.className = 'note-actions-placeholder';
            viaParentText.textContent = config.txtFolderSharedThroughParent;
            actionsDiv.appendChild(viaParentText);
        }

        item.appendChild(actionsDiv);
        return item;
    }

    function renderSharedWithMeItem(sharedItem) {
        var item = document.createElement('div');
        item.className = 'shared-item shared-note-item shared-with-me-row';
        item.dataset.itemType = sharedItem._type;

        var isFolder = sharedItem._type === 'shared_with_me_folder';

        var nameContainer = document.createElement('div');
        nameContainer.className = 'note-name-container';

        var typeIcon = document.createElement('i');
        var defaultIconClass = isFolder ? 'lucide-folder' : 'lucide-sticky-note';
        var customIconClass = sharedItem.icon || defaultIconClass;
        typeIcon.className = 'lucide ' + customIconClass + ' ' + (isFolder ? 'folder-icon' : 'note-icon') + ' shared-type-icon';
        if (sharedItem.icon_color) {
            typeIcon.style.setProperty('color', window.poznoteIconColorCss ? window.poznoteIconColorCss(sharedItem.icon_color) : sharedItem.icon_color, 'important');
            typeIcon.setAttribute('data-icon-color', sharedItem.icon_color);
        }
        nameContainer.appendChild(typeIcon);

        var nameEl = document.createElement('a');
        nameEl.href = sharedItem.url || '#';
        nameEl.className = 'note-name';
        nameEl.textContent = isFolder ? (sharedItem.folder_name || config.txtUntitled) : (sharedItem.heading || config.txtUntitled);
        bindPwaAwareLink(nameEl, sharedItem.url || '');
        nameContainer.appendChild(nameEl);

        if (sharedItemHasVisibleRestriction(sharedItem)) {
            appendRestrictedIndicator(nameContainer);
        }

        // The PATH/FOLDER column is gone: the owner is shown next to the name.
        var ownerBadge = document.createElement('span');
        ownerBadge.className = 'folder-badge';
        ownerBadge.style.marginLeft = '8px';
        var ownerLabel = config.txtSharedBy + ' ' + (sharedItem.owner_name || '');
        ownerBadge.title = ownerLabel;
        ownerBadge.textContent = ownerLabel;
        nameContainer.appendChild(ownerBadge);

        item.appendChild(nameContainer);

        // Token cell — show the actual token (read-only)
        item.appendChild(renderTokenCell(sharedItem.token || '', ''));

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'note-actions';

        var openBtn = document.createElement('button');
        openBtn.className = 'btn btn-sm btn-primary';
        openBtn.innerHTML = '<i class="lucide lucide-external-link"></i>';
        openBtn.title = config.txtOpen;
        (function(url) {
            openBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                window.open(url, '_blank', 'noopener');
            });
        })(sharedItem.url);
        actionsDiv.appendChild(openBtn);

        item.appendChild(actionsDiv);
        return item;
    }

    // ========== Initialization ==========

    document.addEventListener('DOMContentLoaded', function() {
        var backHomeBtn = document.getElementById('backToHomeBtn');
        if (backHomeBtn) {
            backHomeBtn.addEventListener('click', function() {
                if (typeof window.goBackToHome === 'function') {
                    window.goBackToHome();
                } else {
                    window.location.href = 'dashboard.php';
                }
            });
        }

        var backBtn = document.getElementById('backToNotesBtn');
        if (backBtn) {
            backBtn.addEventListener('click', goBackToNotes);
        }

        var toggleAllFoldersBtn = document.getElementById('toggleAllFoldersBtn');
        if (toggleAllFoldersBtn) {
            toggleAllFoldersBtn.addEventListener('click', function(event) {
                if (shouldExpandAllFolders()) {
                    expandAllFolders();
                } else {
                    collapseAllFolders();
                }
                blurAfterPointerActivation(toggleAllFoldersBtn, event);
            });
        }

        var sortSelect = document.getElementById('sharedSortSelect');
        if (sortSelect) {
            sortSelect.value = sortMode;
            sortSelect.addEventListener('change', function() {
                sortMode = this.value;
                saveSortMode();
                renderItems();
            });
        }

        // Text filter
        var filterInput = document.getElementById('filterInput');
        var clearFilterBtn = document.getElementById('clearFilterBtn');

        var urlParams = new URLSearchParams(window.location.search);
        var initialFilter = urlParams.get('filter');
        if (initialFilter && filterInput) {
            filterInput.value = initialFilter;
            filterText = initialFilter.trim().toLowerCase();
            updateClearButton();
        }

        if (filterInput) {
            filterInput.addEventListener('input', function() {
                filterText = this.value.trim().toLowerCase();
                applyFilter();
                updateClearButton();
                syncUrl();
            });
            filterInput.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    filterInput.value = '';
                    filterText = '';
                    applyFilter();
                    updateClearButton();
                    syncUrl();
                }
            });
        }

        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function() {
                if (filterInput) {
                    filterInput.value = '';
                    filterText = '';
                    applyFilter();
                    updateClearButton();
                    syncUrl();
                    filterInput.focus();
                }
            });
        }

        loadSharedNotes();
    });

    var resizeAdjustTimer = null;
    window.addEventListener('resize', function() {
        clearTimeout(resizeAdjustTimer);
        resizeAdjustTimer = setTimeout(adjustSharedColumnWidths, 150);
    });

    window.loadSharedNotes = loadSharedNotes;
    window.goBackToNotes = goBackToNotes;

})();
