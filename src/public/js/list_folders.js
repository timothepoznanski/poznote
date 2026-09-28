/**
 * list_folders.js
 * Handles folder list page functionality
 */

(function() {
    'use strict';

    const workspace = document.body.getAttribute('data-workspace') || '';

    // Search/filter and fold/unfold
    //
    // Rows are flat siblings carrying their nesting level in data-depth, so
    // a row's ancestors are the nearest preceding rows of strictly decreasing
    // depth and its subfolders the following rows of greater depth.
    const filterInput = document.getElementById('filterInput');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const folderItems = Array.from(document.querySelectorAll('.folder-item'));
    const filterStats = document.getElementById('filterStats');
    const treeToolbar = document.getElementById('foldersTreeToolbar');
    const toggleAllBtn = document.getElementById('toggleAllFoldersBtn');
    const bodyData = document.body.dataset;
    const txt = {
        expandFolder: bodyData.txtExpandFolder || 'Expand folder',
        collapseFolder: bodyData.txtCollapseFolder || 'Collapse folder',
        expandAll: bodyData.txtExpandAll || 'Expand all',
        collapseAll: bodyData.txtCollapseAll || 'Collapse all'
    };

    const depthOf = item => parseInt(item.getAttribute('data-depth'), 10) || 0;
    const collapsibleItems = folderItems.filter(item => item.getAttribute('data-has-children') === '1');

    // Folded folders, remembered per account in this browser. Ids of folders
    // that no longer have subfolders are dropped on load.
    const COLLAPSED_STORAGE_KEY = 'poznote.folders.collapsedFolders';
    const folderStorage = window.__poznoteUserStorage || window.localStorage;
    const collapsedIds = new Set();
    try {
        const stored = JSON.parse(folderStorage.getItem(COLLAPSED_STORAGE_KEY) || '[]');
        const collapsibleIds = new Set(collapsibleItems.map(item => item.getAttribute('data-folder-id')));
        if (Array.isArray(stored)) {
            stored.map(String).forEach(id => { if (collapsibleIds.has(id)) collapsedIds.add(id); });
        }
    } catch (error) {
        // No storage: every folder starts unfolded
    }

    function saveCollapsedIds() {
        try {
            folderStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(Array.from(collapsedIds)));
        } catch (error) {
            // The fold state just won't survive a reload
        }
    }

    function updateToggleButton(item, collapsed) {
        const button = item.querySelector('[data-action="toggle-folder-collapse"]');
        if (!button) return;
        const label = collapsed ? txt.expandFolder : txt.collapseFolder;
        button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        button.title = label;
        button.setAttribute('aria-label', label);
        const icon = button.querySelector('.lucide');
        if (icon) {
            icon.classList.toggle('lucide-chevron-right', collapsed);
            icon.classList.toggle('lucide-chevron-down', !collapsed);
        }
    }

    function applyFolderVisibility() {
        const query = filterInput ? filterInput.value.toLowerCase().trim() : '';
        const filtering = query.length > 0;
        const visible = new Set();
        let visibleCount = 0;

        if (filtering) {
            // Folding is set aside while filtering: a match shows with its
            // ancestors, otherwise a matching subfolder would appear detached
            // from the hierarchy the list is meant to show
            folderItems.forEach((item, index) => {
                const name = item.getAttribute('data-folder-name').toLowerCase();
                if (!name.includes(query)) return;

                visible.add(index);
                visibleCount++;

                let depth = depthOf(item);
                for (let i = index - 1; i >= 0 && depth > 0; i--) {
                    const ancestorDepth = depthOf(folderItems[i]);
                    if (ancestorDepth < depth) {
                        visible.add(i);
                        depth = ancestorDepth;
                    }
                }
            });
        } else {
            // A row is hidden while it sits below a folded folder
            let hiddenBelowDepth = null;
            folderItems.forEach((item, index) => {
                const depth = depthOf(item);
                if (hiddenBelowDepth !== null && depth > hiddenBelowDepth) return;
                hiddenBelowDepth = collapsedIds.has(item.getAttribute('data-folder-id')) ? depth : null;
                visible.add(index);
            });
        }

        folderItems.forEach((item, index) => {
            item.style.display = visible.has(index) ? 'flex' : 'none';
            const collapsed = !filtering && collapsedIds.has(item.getAttribute('data-folder-id'));
            item.classList.toggle('is-collapsed', collapsed);
            updateToggleButton(item, collapsed);
        });

        if (filtering) {
            clearFilterBtn.classList.remove('initially-hidden');
            filterStats.classList.remove('initially-hidden');
            filterStats.textContent = visibleCount + ' ' + (visibleCount > 1 ? 'folders' : 'folder');
        } else if (clearFilterBtn && filterStats) {
            clearFilterBtn.classList.add('initially-hidden');
            filterStats.classList.add('initially-hidden');
        }

        updateTreeToolbar(filtering);
    }

    // "Expand all" while any folder is folded, "Collapse all" otherwise
    function updateTreeToolbar(filtering) {
        if (!treeToolbar || !toggleAllBtn) return;
        treeToolbar.classList.toggle('initially-hidden', collapsibleItems.length === 0);

        const expand = collapsedIds.size > 0;
        toggleAllBtn.disabled = filtering;
        toggleAllBtn.setAttribute('aria-expanded', expand ? 'false' : 'true');
        const label = document.getElementById('toggleAllFoldersLabel');
        if (label) label.textContent = expand ? txt.expandAll : txt.collapseAll;
        const icon = toggleAllBtn.querySelector('.lucide');
        if (icon) {
            icon.classList.toggle('lucide-chevron-down', expand);
            icon.classList.toggle('lucide-chevron-up', !expand);
        }
    }

    function toggleFolderCollapse(item) {
        const id = item.getAttribute('data-folder-id');
        if (!id) return;
        if (collapsedIds.has(id)) {
            collapsedIds.delete(id);
        } else {
            collapsedIds.add(id);
        }
        saveCollapsedIds();
        applyFolderVisibility();
    }

    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', function() {
            if (collapsedIds.size > 0) {
                collapsedIds.clear();
            } else {
                collapsibleItems.forEach(item => collapsedIds.add(item.getAttribute('data-folder-id')));
            }
            saveCollapsedIds();
            applyFolderVisibility();
        });
    }

    if (filterInput) {
        filterInput.addEventListener('input', applyFolderVisibility);
    }

    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
            filterInput.value = '';
            filterInput.dispatchEvent(new Event('input'));
            filterInput.focus();
        });
    }

    applyFolderVisibility();

    // Folder actions
    //
    // On desktop a row shows its frequent actions as icons and the three-dot
    // button opens #folderRowActionsMenu, a dropdown with the others. On
    // mobile the button opens #folderActionsModal, which holds every action
    // item of the folder actions dropdown of index.php. The implementations
    // are reused from the js/utils-*.js set, js/share.js and js/folder-icon.js,
    // all loaded by this page.
    const actionsModal = document.getElementById('folderActionsModal');
    const actionsMenu = document.getElementById('folder-actions-menu');
    const actionsModalTitle = document.getElementById('folderActionsModalTitle');
    const actionsModalIcon = document.getElementById('folderActionsModalIcon');
    const rowMenu = document.getElementById('folderRowActionsMenu');

    // Same breakpoint as the media query hiding the row icons
    const mobileQuery = window.matchMedia('(max-width: 768px)');

    // Folder the modal or the dropdown currently targets
    let activeFolder = null;
    // Three-dot button whose dropdown is showing
    let rowMenuButton = null;

    // utils.js and folder-icon.js declare these at script top level, so they
    // land on window even where nothing assigns them explicitly
    function callFn(name) {
        if (typeof window[name] !== 'function') {
            console.error('list_folders: missing folder action implementation ' + name);
            return false;
        }
        window[name].apply(null, Array.prototype.slice.call(arguments, 1));
        return true;
    }

    // folder-icon.js's updateFolderIconInUI only refreshes the index.php
    // sidebar and the Kanban view after an icon change; wrap it so the row
    // icons of this page refresh too (this script loads after folder-icon.js)
    const originalUpdateFolderIconInUI = window.updateFolderIconInUI;
    window.updateFolderIconInUI = function(folderId, iconClass, iconColor) {
        if (typeof originalUpdateFolderIconInUI === 'function') {
            originalUpdateFolderIconInUI(folderId, iconClass, iconColor);
        }

        const btn = document.querySelector('.folder-list-menu-btn[data-folder-id="' + folderId + '"]');
        const row = btn && btn.closest('.folder-item');
        const icon = row && row.querySelector('.shared-folder-icon i');
        if (!icon) return;

        // Same markup as the PHP row rendering: the icon class alone, the
        // custom color (or none) forced over the dark-mode recolor filter
        icon.className = iconClass || 'lucide-folder';
        if (iconColor) {
            icon.style.setProperty('color', window.poznoteIconColorCss ? window.poznoteIconColorCss(iconColor) : iconColor, 'important');
        } else {
            icon.style.removeProperty('color');
        }
        icon.style.setProperty('filter', 'none', 'important');
    };

    function closeActionsModal() {
        if (actionsModal) actionsModal.style.display = 'none';
    }

    // Folder carried by a three-dot button
    function readFolder(button) {
        return {
            id: button.getAttribute('data-folder-id'),
            name: button.getAttribute('data-folder-name') || '',
            noteCount: parseInt(button.getAttribute('data-note-count'), 10) || 0,
            shared: button.getAttribute('data-shared') === '1',
            favorite: button.getAttribute('data-favorite') === '1',
            offline: button.getAttribute('data-offline') === '1'
        };
    }

    // Fit the items of a menu to the folder it opens for
    function prepareMenu(menu, folder) {
        // Carry the folder identity onto every action item, like the shared
        // dropdown of index.php does
        menu.querySelectorAll('[data-action]').forEach(function(item) {
            item.setAttribute('data-folder-id', folder.id);
            item.setAttribute('data-folder-name', folder.name);
        });

        // Items only relevant when the folder contains notes
        menu.querySelectorAll('.requires-notes').forEach(function(item) {
            item.style.display = folder.noteCount > 0 ? '' : 'none';
        });

        // Share and favorite items: show the variant matching the folder state
        menu.querySelectorAll('.share-state-shared').forEach(function(item) {
            item.style.display = folder.shared ? '' : 'none';
        });
        menu.querySelectorAll('.share-state-not-shared').forEach(function(item) {
            item.style.display = folder.shared ? 'none' : '';
        });
        menu.querySelectorAll('.favorite-state-favorite').forEach(function(item) {
            item.style.display = folder.favorite ? '' : 'none';
        });
        menu.querySelectorAll('.favorite-state-not-favorite').forEach(function(item) {
            item.style.display = folder.favorite ? 'none' : '';
        });
        menu.querySelectorAll('.offline-state-kept').forEach(function(item) {
            item.style.display = folder.offline ? '' : 'none';
        });
        menu.querySelectorAll('.offline-state-not-kept').forEach(function(item) {
            item.style.display = folder.offline ? 'none' : '';
        });
    }

    function openActionsModal(button) {
        if (!actionsModal || !actionsMenu) return;

        activeFolder = readFolder(button);

        if (actionsModalTitle) actionsModalTitle.textContent = activeFolder.name;
        if (actionsModalIcon) {
            const rowIcon = button.closest('.folder-item').querySelector('.shared-folder-icon i');
            actionsModalIcon.className = rowIcon ? rowIcon.className : 'lucide lucide-folder';
        }

        prepareMenu(actionsMenu, activeFolder);
        actionsModal.style.display = 'flex';
    }

    function closeRowMenu() {
        if (rowMenu) rowMenu.classList.remove('show');
        if (rowMenuButton) rowMenuButton.classList.remove('open');
        rowMenuButton = null;
    }

    function openRowMenu(button) {
        if (!rowMenu) return;

        activeFolder = readFolder(button);
        prepareMenu(rowMenu, activeFolder);

        rowMenu.classList.add('show');
        button.classList.add('open');
        rowMenuButton = button;

        // The menu is position: fixed, so it is placed against the viewport:
        // right edge on the button's (the button ends the row), below it, or
        // above it when it would run past the bottom of the window
        const margin = 8;
        const buttonRect = button.getBoundingClientRect();
        const menuRect = rowMenu.getBoundingClientRect();
        let top = buttonRect.bottom + 4;
        if (top + menuRect.height > window.innerHeight - margin) {
            const above = buttonRect.top - menuRect.height - 4;
            top = above >= margin ? above : Math.max(margin, window.innerHeight - menuRect.height - margin);
        }
        rowMenu.style.top = top + 'px';
        rowMenu.style.left = Math.max(margin, buttonRect.right - menuRect.width) + 'px';
    }

    function workspaceQuery(prefix) {
        return workspace ? prefix + 'workspace=' + encodeURIComponent(workspace) : '';
    }

    // Actions that need a folder id, keyed by the data-action of the menu item
    const folderActions = {
        'open-kanban-view': function(folder) {
            // The inline Kanban view needs index.php's right column, so open
            // the folder's board on index.php instead
            window.location.href = 'index.php?kanban=' + encodeURIComponent(folder.id) + workspaceQuery('&');
        },
        'show-only-folder': function(folder) {
            if (!folder.name) return;
            let url = 'index.php?folder=' + encodeURIComponent(folder.name) + workspaceQuery('&');
            url += '&kanban=' + encodeURIComponent(folder.id);
            window.location.href = url;
        },
        'move-folder-files': function(folder) {
            callFn('showMoveFolderFilesDialog', folder.id, folder.name);
        },
        'move-entire-folder': function(folder) {
            callFn('showMoveEntireFolderDialog', folder.id, folder.name);
        },
        'duplicate-folder': function(folder) {
            callFn('duplicateFolder', folder.id, folder.name);
        },
        'download-folder': function(folder) {
            callFn('downloadFolder', folder.id, folder.name);
        },
        'tag-folder-notes': function(folder) {
            callFn('showTagFolderNotesDialog', folder.id, folder.name, folder.noteCount);
        },
        'share-folder': function(folder) {
            callFn('openPublicFolderShareModal', folder.id);
        },
        'favorite-folder': function(folder) {
            toggleFolderFavoriteFromList(folder);
        },
        'offline-folder': function(folder) {
            toggleFolderOfflineFromList(folder);
        },
        'rename-folder': function(folder) {
            callFn('editFolderName', folder.id, folder.name);
        },
        'change-folder-icon': function(folder) {
            callFn('showChangeFolderIconModal', folder.id, folder.name);
        },
        'archive-folder': function(folder) {
            callFn('archiveFolder', folder.id, folder.name);
        },
        'delete-folder': function(folder) {
            callFn('deleteFolder', folder.id, folder.name);
        }
    };

    /**
     * Toggle the favorite state of a folder.
     *
     * utils.js's toggleFolderFavorite reads the current state from a
     * .folder-actions-toggle element that only the index.php sidebar renders,
     * so it would always send favorite=true here. Call the API directly with
     * the state carried by the row's menu button instead.
     */
    function toggleFolderFavoriteFromList(folder) {
        fetch('/api/v1/folders/' + encodeURIComponent(folder.id) + '/favorite', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ favorite: !folder.favorite })
        })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (data.success) {
                    window.location.reload();
                } else if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup('Error: ' + (data.message || 'Unknown error'), 'error');
                }
            })
            .catch(function(error) {
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup('Error updating favorites', 'error');
                }
                console.error('Folder favorite toggle error:', error);
            });
    }

    /**
     * Keep a folder offline (its notes, subfolders included, stay in the
     * browser whatever their date), or stop. No reload: the state goes onto
     * the row's buttons, and the mark of the row follows once this browser's
     * copies are up to date (js/offline-sync.js writes-only mode,
     * js/offline-marks.js).
     */
    function toggleFolderOfflineFromList(folder) {
        const keep = !folder.offline;
        fetch('/api/v1/folders/' + encodeURIComponent(folder.id) + '/offline', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ offline: keep })
        })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                if (!data.success) {
                    throw new Error(data.error || data.message || 'Unknown error');
                }
                document.querySelectorAll('[data-folder-id="' + folder.id + '"][data-offline]').forEach(function(element) {
                    element.setAttribute('data-offline', keep ? '1' : '0');
                });
                if (typeof window.poznoteOfflineSyncNow === 'function') {
                    Promise.resolve(window.poznoteOfflineSyncNow()).then(function() {
                        if (typeof window.poznoteOfflineMarksRefresh === 'function') {
                            window.poznoteOfflineMarksRefresh();
                        }
                    });
                }
            })
            .catch(function(error) {
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup(window.t ? window.t('offline.keep.error', null, 'The offline setting could not be saved.') : 'The offline setting could not be saved.', 'error');
                }
                console.error('Folder offline toggle error:', error);
            });
    }

    document.addEventListener('click', function(event) {
        const actionElement = event.target.closest('[data-action]');

        // A click anywhere but the dropdown closes it. Its own button is
        // remembered first, so a second click on it closes the menu instead of
        // reopening it.
        const clickedRowMenuButton = rowMenuButton;
        if (rowMenuButton && !(rowMenu && rowMenu.contains(event.target))) {
            closeRowMenu();
        }

        if (!actionElement) return;

        const action = actionElement.getAttribute('data-action');

        if (action === 'open-folder-actions-modal') {
            event.preventDefault();
            event.stopPropagation();
            if (mobileQuery.matches) {
                openActionsModal(actionElement);
            } else if (clickedRowMenuButton !== actionElement) {
                openRowMenu(actionElement);
            }
            return;
        }

        // Chevron of a folder with subfolders: fold or unfold it, without
        // opening the row's Kanban board
        if (action === 'toggle-folder-collapse') {
            event.preventDefault();
            event.stopPropagation();
            const item = actionElement.closest('.folder-item');
            if (item) toggleFolderCollapse(item);
            return;
        }

        // Row click opens the folder's Kanban board
        if (action === 'open-folder-kanban') {
            const url = actionElement.getAttribute('data-kanban-url');
            if (url) window.location.href = url;
            return;
        }

        if (!folderActions[action]) return;

        // Menu items act on the folder the modal or the dropdown was opened
        // for; the inline icon buttons of a row (desktop) carry their own
        // folder identity
        const insideModal = actionsMenu && actionsMenu.contains(actionElement);
        const insideRowMenu = rowMenu && rowMenu.contains(actionElement);
        const insideRow = !!actionElement.closest('.folder-list-actions');
        if (!insideModal && !insideRowMenu && !insideRow) return;

        event.preventDefault();
        event.stopPropagation();

        const folder = (insideModal || insideRowMenu) ? activeFolder : readFolder(actionElement);
        if (!folder || !folder.id) return;

        // Close the menu first so the action's own modal is visible
        if (insideModal) closeActionsModal();
        if (insideRowMenu) closeRowMenu();
        folderActions[action](folder);
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && rowMenuButton) closeRowMenu();
    });
    // A fixed dropdown would drift away from its row: close it instead
    window.addEventListener('scroll', function() {
        if (rowMenuButton) closeRowMenu();
    }, true);
    window.addEventListener('resize', function() {
        if (rowMenuButton) closeRowMenu();
    });

    // Close the actions modal when clicking its backdrop
    if (actionsModal) {
        actionsModal.addEventListener('click', function(event) {
            if (event.target === actionsModal) closeActionsModal();
        });
    }

    // Back buttons
    const backToNotesBtn = document.getElementById('backToNotesBtn');
    if (backToNotesBtn) {
        backToNotesBtn.addEventListener('click', function() {
            window.location.href = 'index.php' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
        });
    }

    const backToHomeBtn = document.getElementById('backToHomeBtn');
    if (backToHomeBtn) {
        backToHomeBtn.addEventListener('click', function() {
            window.location.href = 'dashboard.php' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
        });
    }
})();
