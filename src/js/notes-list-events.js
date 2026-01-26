// Notes list event delegation (CSP-compliant)
// This file handles all click events for notes_list.php using event delegation

(function () {
    'use strict';

    /**
     * Toggle search bar visibility
     */
    function toggleSearchBar() {
        var searchContainer = document.getElementById('search-bar-container');
        var searchInput = document.getElementById('unified-search');
        if (!searchContainer) return;

        var currentDisplay = window.getComputedStyle(searchContainer).display;

        if (currentDisplay === 'none') {
            // Open search bar
            searchContainer.style.display = 'block';
            localStorage.setItem('searchBarVisible', 'true');

            // Focus the search input
            if (searchInput) {
                setTimeout(function () {
                    searchInput.focus();
                }, 100);
            }
        } else {
            // Close search bar
            searchContainer.style.display = 'none';
            localStorage.setItem('searchBarVisible', 'false');

            // Clear search only if there's an active search
            if (window.isSearchMode && typeof window.clearUnifiedSearch === 'function') {
                window.clearUnifiedSearch();
            }
        }
    }

    // Expose toggleSearchBar globally
    window.toggleSearchBar = toggleSearchBar;

    /**
     * Handle search type toggle (notes vs tags)
     */
    function handleSearchTypeToggle(event) {
        var button = event.target.closest('.searchbar-type-btn');
        if (!button) return;

        var searchType = button.getAttribute('data-search-type');
        if (!searchType) return;

        // Delegate to SearchManager if available (handles both button state and search execution)
        if (window.searchManager && typeof window.searchManager.handleButtonClick === 'function') {
            window.searchManager.handleButtonClick(searchType, false); // false = desktop
            return;
        }

        // Fallback: manual update if SearchManager not available
        // Update button states
        var allButtons = document.querySelectorAll('.searchbar-type-btn');
        allButtons.forEach(function (btn) {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        // Update hidden fields
        var searchInNotes = document.getElementById('search-in-notes');
        var searchInTags = document.getElementById('search-in-tags');
        var searchInput = document.getElementById('unified-search');

        if (searchType === 'notes') {
            if (searchInNotes) searchInNotes.value = '1';
            if (searchInTags) searchInTags.value = '';
            if (searchInput) searchInput.placeholder = (window.t ? window.t('search.placeholder_notes', null, 'Search for one or more words...') : 'Search for one or more words...');
        } else if (searchType === 'tags') {
            if (searchInNotes) searchInNotes.value = '';
            if (searchInTags) searchInTags.value = '1';
            if (searchInput) searchInput.placeholder = (window.t ? window.t('search.placeholder_tags', null, 'Search for one or more tags...') : 'Search for one or more tags...');
        }

        // Focus the input
        if (searchInput) {
            searchInput.focus();
        }
    }

    /**
     * Handle all click events in the notes list using delegation
     */
    function handleNotesListClick(event) {
        var target = event.target;

        // Find the closest element with a data-action attribute
        var actionElement = target.closest('[data-action]');
        if (!actionElement) return;

        var action = actionElement.getAttribute('data-action');

        // Skip if the action element is inside another action element (nested actions)
        // In that case, only handle the innermost action
        var parentAction = actionElement.parentElement ? actionElement.parentElement.closest('[data-action]') : null;
        if (parentAction && target.closest('[data-action]') !== actionElement) {
            return; // Let the innermost action handle it
        }

        switch (action) {
            case 'toggle-search-bar':
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.toggleSearchBar === 'function') {
                    window.toggleSearchBar();
                }
                break;

            case 'navigate-tags':
                event.preventDefault();
                event.stopPropagation();
                var tagsUrl = actionElement.getAttribute('data-url');
                if (tagsUrl) {
                    window.location = tagsUrl;
                }
                break;

            case 'toggle-favorites':
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.toggleFolder === 'function') {
                    window.toggleFolder('folder-favorites');
                }
                break;

            case 'navigate-shared':
                event.preventDefault();
                event.stopPropagation();
                var sharedUrl = actionElement.getAttribute('data-url');
                if (sharedUrl) {
                    window.location = sharedUrl;
                }
                break;

            case 'toggle-system-menu':
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.toggleSystemMenu === 'function') {
                    window.toggleSystemMenu();
                }
                break;

            case 'navigate-trash':
                event.preventDefault();
                event.stopPropagation();
                var trashUrl = actionElement.getAttribute('data-url');
                if (trashUrl) {
                    window.location = trashUrl;
                }
                break;

            case 'navigate-attachments':
                event.preventDefault();
                event.stopPropagation();
                var attachmentsUrl = actionElement.getAttribute('data-url');
                if (attachmentsUrl) {
                    window.location = attachmentsUrl;
                }
                break;

            case 'clear-search':
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.clearUnifiedSearch === 'function') {
                    window.clearUnifiedSearch();
                }
                break;

            case 'select-folder':
                // Don't stop propagation here - let the parent handle it
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder');
                if (typeof window.selectFolder === 'function') {
                    window.selectFolder(folderId, folderName, actionElement);
                }
                break;

            case 'toggle-folder':
                event.preventDefault();
                event.stopPropagation();
                var folderDomId = actionElement.getAttribute('data-folder-dom-id');
                if (folderDomId && typeof window.toggleFolder === 'function') {
                    window.toggleFolder(folderDomId);
                }
                break;

            case 'toggle-favorites':
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.toggleFavorites === 'function') {
                    window.toggleFavorites(actionElement);
                }
                break;

            case 'open-folder-icon-picker':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');
                if (folderId && folderName && typeof window.showChangeFolderIconModal === 'function') {
                    window.showChangeFolderIconModal(folderId, folderName);
                }
                break;

            case 'load-note':
                // Handle note loading via AJAX
                var noteLink = actionElement.getAttribute('href');
                var noteId = actionElement.getAttribute('data-note-db-id');
                if (noteLink && noteId && typeof window.loadNoteDirectly === 'function') {
                    var result = window.loadNoteDirectly(noteLink, noteId, event);
                    if (result === false) {
                        event.preventDefault();
                    }
                }
                break;

            // Folder actions menu
            case 'toggle-folder-actions-menu':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                if (folderId && typeof window.toggleFolderActionsMenu === 'function') {
                    window.toggleFolderActionsMenu(folderId);
                }
                break;

            case 'create-note-in-folder':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');
                if (typeof window.closeFolderActionsMenu === 'function') {
                    window.closeFolderActionsMenu(folderId);
                }
                if (folderId && folderName && typeof window.showCreateNoteInFolderModal === 'function') {
                    window.showCreateNoteInFolderModal(folderId, folderName);
                }
                break;

            case 'move-folder-files':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');
                if (typeof window.closeFolderActionsMenu === 'function') {
                    window.closeFolderActionsMenu(folderId);
                }
                if (folderId && folderName && typeof window.showMoveFolderFilesDialog === 'function') {
                    window.showMoveFolderFilesDialog(folderId, folderName);
                }
                break;

            case 'move-entire-folder':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');
                if (typeof window.closeFolderActionsMenu === 'function') {
                    window.closeFolderActionsMenu(folderId);
                }
                if (folderId && folderName && typeof window.showMoveEntireFolderDialog === 'function') {
                    window.showMoveEntireFolderDialog(folderId, folderName);
                }
                break;

            case 'download-folder':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');
                if (typeof window.closeFolderActionsMenu === 'function') {
                    window.closeFolderActionsMenu(folderId);
                }
                if (folderId && folderName && typeof window.downloadFolder === 'function') {
                    window.downloadFolder(folderId, folderName);
                }
                break;

            case 'rename-folder':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');
                if (typeof window.closeFolderActionsMenu === 'function') {
                    window.closeFolderActionsMenu(folderId);
                }
                if (folderId && folderName && typeof window.editFolderName === 'function') {
                    window.editFolderName(folderId, folderName);
                }
                break;

            case 'delete-folder':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');
                if (typeof window.closeFolderActionsMenu === 'function') {
                    window.closeFolderActionsMenu(folderId);
                }
                if (folderId && folderName && typeof window.deleteFolder === 'function') {
                    window.deleteFolder(folderId, folderName);
                }
                break;

            case 'change-folder-icon':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');
                if (typeof window.closeFolderActionsMenu === 'function') {
                    window.closeFolderActionsMenu(folderId);
                }
                if (folderId && folderName && typeof window.showChangeFolderIconModal === 'function') {
                    window.showChangeFolderIconModal(folderId, folderName);
                }
                break;

            case 'share-folder':
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');
                if (typeof window.closeFolderActionsMenu === 'function') {
                    window.closeFolderActionsMenu(folderId);
                }
                if (folderId && typeof window.openPublicFolderShareModal === 'function') {
                    window.openPublicFolderShareModal(folderId);
                }
                break;

            case 'open-kanban-view':
                event.preventDefault();
                event.stopPropagation();

                // Check if Kanban on click is disabled via body class
                if (document.body.classList.contains('disable-kanban-click')) {
                    // Open folder icon picker instead
                    var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                    var folderName = actionElement.getAttribute('data-folder-name');

                    if (folderId && folderName && typeof window.showChangeFolderIconModal === 'function') {
                        window.showChangeFolderIconModal(folderId, folderName);
                    }
                    break;
                }

                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                var folderName = actionElement.getAttribute('data-folder-name');

                if (folderId && typeof window.openKanbanView === 'function') {
                    window.openKanbanView(folderId, folderName);
                }
                break;

            case 'close-kanban-view':
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.closeKanbanView === 'function') {
                    window.closeKanbanView();
                }
                break;
        }
    }

    /**
     * Handle double-click events for folder renaming
     */
    function handleNotesListDblClick(event) {
        var target = event.target;

        // Find the closest element with a data-dblaction attribute
        var actionElement = target.closest('[data-dblaction]');
        if (!actionElement) return;

        var action = actionElement.getAttribute('data-dblaction');

        if (action === 'edit-folder-name') {
            var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
            var folderName = actionElement.getAttribute('data-folder-name');
            if (folderId && folderName && typeof window.editFolderName === 'function') {
                window.editFolderName(folderId, folderName);
            }
        }
    }

    /**
     * Initialize event delegation
     */
    function initNotesListEvents() {
        // Search bar is now always visible - no need to toggle or restore state
        var searchContainer = document.getElementById('search-bar-container');
        if (searchContainer) {
            searchContainer.style.display = 'block';
        }

        // Initialize search type buttons state
        var searchInNotes = document.getElementById('search-in-notes');
        var searchInTags = document.getElementById('search-in-tags');
        var notesBtn = document.querySelector('.searchbar-type-notes');
        var tagsBtn = document.querySelector('.searchbar-type-tags');

        if (searchInTags && searchInTags.value === '1') {
            if (notesBtn) notesBtn.classList.remove('active');
            if (tagsBtn) tagsBtn.classList.add('active');
        } else {
            if (notesBtn) notesBtn.classList.add('active');
            if (tagsBtn) tagsBtn.classList.remove('active');
        }

        // Add event listener for search type buttons
        var typeButtons = document.querySelectorAll('.searchbar-type-btn');
        typeButtons.forEach(function (btn) {
            btn.addEventListener('click', handleSearchTypeToggle);
        });

        // Favorites are now always visible - force them open
        var favoritesFolder = document.getElementById('folder-favorites');
        if (favoritesFolder) {
            favoritesFolder.style.display = 'block';
            localStorage.setItem('folder_folder-favorites', 'open');
        }

        // Restore favorites collapsed state
        var favoritesCollapsed = localStorage.getItem('favorites_collapsed') === 'true';
        var favoritesHeader = document.querySelector('[data-folder="Favorites"]');
        var favoritesToggleBtn = document.querySelector('[data-action="toggle-favorites"]');
        if (favoritesCollapsed && favoritesHeader) {
            favoritesHeader.classList.add('favorites-collapsed');
            if (favoritesToggleBtn) {
                favoritesToggleBtn.classList.add('collapsed');
                favoritesToggleBtn.classList.remove('favorites-expanded');
            }
        } else if (favoritesHeader && favoritesToggleBtn) {
            favoritesHeader.classList.remove('favorites-collapsed');
            favoritesToggleBtn.classList.remove('collapsed');
            favoritesToggleBtn.classList.add('favorites-expanded');
        }

        // Add direct event listener to favorites toggle button (in case delegation doesn't work)
        if (favoritesToggleBtn) {
            favoritesToggleBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.toggleFavorites === 'function') {
                    window.toggleFavorites(this);
                }
            });
        }

        // Add click event listener with delegation
        document.addEventListener('click', handleNotesListClick);

        // Add double-click event listener with delegation
        document.addEventListener('dblclick', handleNotesListDblClick);
    }

    /**
     * Reinitialize favorites toggle button event listener
     * Called after AJAX refresh of notes list
     */
    function reinitializeFavoritesToggle() {
        var favoritesToggleBtn = document.querySelector('[data-action="toggle-favorites"]');
        if (favoritesToggleBtn) {
            // Remove old listener by cloning the element
            var newBtn = favoritesToggleBtn.cloneNode(true);
            favoritesToggleBtn.parentNode.replaceChild(newBtn, favoritesToggleBtn);

            // Add fresh event listener
            newBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.toggleFavorites === 'function') {
                    window.toggleFavorites(this);
                }
            });
        }
    }

    // Expose to window for use after AJAX refresh
    window.reinitializeFavoritesToggle = reinitializeFavoritesToggle;

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNotesListEvents);
    } else {
        initNotesListEvents();
    }
})();
