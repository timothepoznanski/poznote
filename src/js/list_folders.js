/**
 * list_folders.js
 * Handles folder list page functionality
 */

(function() {
    'use strict';

    const workspace = document.body.getAttribute('data-workspace') || '';

    // Search/filter functionality
    const filterInput = document.getElementById('filterInput');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const folderItems = document.querySelectorAll('.folder-item');
    const filterStats = document.getElementById('filterStats');

    if (filterInput) {
        filterInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            let visibleCount = 0;

            // Rows are flat siblings carrying their nesting level in
            // data-depth, so a row's ancestors are the nearest preceding rows
            // of strictly decreasing depth. Keep them visible around a match,
            // otherwise a matching subfolder would appear detached from the
            // hierarchy the list is meant to show.
            const matched = new Set();
            folderItems.forEach((item, index) => {
                const name = item.getAttribute('data-folder-name').toLowerCase();
                if (!name.includes(query)) return;

                matched.add(index);
                visibleCount++;

                let depth = parseInt(item.getAttribute('data-depth'), 10) || 0;
                for (let i = index - 1; i >= 0 && depth > 0; i--) {
                    const ancestorDepth = parseInt(folderItems[i].getAttribute('data-depth'), 10) || 0;
                    if (ancestorDepth < depth) {
                        matched.add(i);
                        depth = ancestorDepth;
                    }
                }
            });

            folderItems.forEach((item, index) => {
                item.style.display = matched.has(index) ? 'flex' : 'none';
            });

            if (query.length > 0) {
                clearFilterBtn.classList.remove('initially-hidden');
                filterStats.classList.remove('initially-hidden');
                filterStats.textContent = visibleCount + ' ' + (visibleCount > 1 ? 'folders' : 'folder');
            } else {
                clearFilterBtn.classList.add('initially-hidden');
                filterStats.classList.add('initially-hidden');
            }
        });
    }

    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
            filterInput.value = '';
            filterInput.dispatchEvent(new Event('input'));
            filterInput.focus();
        });
    }

    // Folder actions modal
    //
    // The three-dot button of each row opens #folderActionsModal, which holds
    // the same action items as the folder actions dropdown of index.php. The
    // implementations are reused from js/utils.js, js/share.js and
    // js/folder-icon.js, all loaded by this page.
    const actionsModal = document.getElementById('folderActionsModal');
    const actionsMenu = document.getElementById('folder-actions-menu');
    const actionsModalTitle = document.getElementById('folderActionsModalTitle');
    const actionsModalIcon = document.getElementById('folderActionsModalIcon');

    // Folder the modal currently targets
    let activeFolder = null;

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

        const btn = document.querySelector('.folder-list-actions [data-action="change-folder-icon"][data-folder-id="' + folderId + '"]');
        const row = btn && btn.closest('.folder-item');
        const icon = row && row.querySelector('.shared-folder-icon i');
        if (!icon) return;

        // Same markup as the PHP row rendering: the icon class alone, the
        // custom color (or none) forced over the dark-mode recolor filter
        icon.className = iconClass || 'lucide-folder';
        if (iconColor) {
            icon.style.setProperty('color', iconColor, 'important');
        } else {
            icon.style.removeProperty('color');
        }
        icon.style.setProperty('filter', 'none', 'important');
    };

    function closeActionsModal() {
        if (actionsModal) actionsModal.style.display = 'none';
    }

    function openActionsModal(button) {
        if (!actionsModal || !actionsMenu) return;

        activeFolder = {
            id: button.getAttribute('data-folder-id'),
            name: button.getAttribute('data-folder-name') || '',
            noteCount: parseInt(button.getAttribute('data-note-count'), 10) || 0,
            shared: button.getAttribute('data-shared') === '1',
            favorite: button.getAttribute('data-favorite') === '1'
        };

        if (actionsModalTitle) actionsModalTitle.textContent = activeFolder.name;
        if (actionsModalIcon) {
            const rowIcon = button.closest('.folder-item').querySelector('.shared-folder-icon i');
            actionsModalIcon.className = rowIcon ? rowIcon.className : 'lucide lucide-folder';
        }

        // Carry the folder identity onto every action item, like the shared
        // dropdown of index.php does
        actionsMenu.querySelectorAll('[data-action]').forEach(function(item) {
            item.setAttribute('data-folder-id', activeFolder.id);
            item.setAttribute('data-folder-name', activeFolder.name);
        });

        // Items only relevant when the folder contains notes
        actionsMenu.querySelectorAll('.requires-notes').forEach(function(item) {
            item.style.display = activeFolder.noteCount > 0 ? '' : 'none';
        });

        // Share and favorite items: show the variant matching the folder state
        actionsMenu.querySelectorAll('.share-state-shared').forEach(function(item) {
            item.style.display = activeFolder.shared ? '' : 'none';
        });
        actionsMenu.querySelectorAll('.share-state-not-shared').forEach(function(item) {
            item.style.display = activeFolder.shared ? 'none' : '';
        });
        actionsMenu.querySelectorAll('.favorite-state-favorite').forEach(function(item) {
            item.style.display = activeFolder.favorite ? '' : 'none';
        });
        actionsMenu.querySelectorAll('.favorite-state-not-favorite').forEach(function(item) {
            item.style.display = activeFolder.favorite ? 'none' : '';
        });

        actionsModal.style.display = 'flex';
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
        'share-folder': function(folder) {
            callFn('openPublicFolderShareModal', folder.id);
        },
        'favorite-folder': function(folder) {
            toggleFolderFavoriteFromList(folder);
        },
        'rename-folder': function(folder) {
            callFn('editFolderName', folder.id, folder.name);
        },
        'change-folder-icon': function(folder) {
            callFn('showChangeFolderIconModal', folder.id, folder.name);
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

    document.addEventListener('click', function(event) {
        const actionElement = event.target.closest('[data-action]');
        if (!actionElement) return;

        const action = actionElement.getAttribute('data-action');

        if (action === 'open-folder-actions-modal') {
            event.preventDefault();
            event.stopPropagation();
            openActionsModal(actionElement);
            return;
        }

        // Row click opens the folder's Kanban board
        if (action === 'open-folder-kanban') {
            const url = actionElement.getAttribute('data-kanban-url');
            if (url) window.location.href = url;
            return;
        }

        if (!folderActions[action]) return;

        // Menu items act on the folder the modal was opened for; the inline
        // icon buttons of a row (desktop) carry their own folder identity
        const insideMenu = actionsMenu && actionsMenu.contains(actionElement);
        const insideRow = !!actionElement.closest('.folder-list-actions');
        if (!insideMenu && !insideRow) return;

        event.preventDefault();
        event.stopPropagation();

        const folder = insideMenu ? activeFolder : {
            id: actionElement.getAttribute('data-folder-id'),
            name: actionElement.getAttribute('data-folder-name') || '',
            favorite: actionElement.getAttribute('data-favorite') === '1'
        };
        if (!folder || !folder.id) return;

        // Close the actions modal first so the action's own modal is visible
        if (insideMenu) closeActionsModal();
        folderActions[action](folder);
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
