/**
 * Notes List Event Delegation
 * CSP-compliant event handling for notes_list.php
 * 
 * This module handles all click and double-click events using event delegation
 * for better performance and maintainability.
 */
(function () {
    'use strict';

    // =====================================================
    // DOUBLE-CLICK DETECTION
    // =====================================================

    var clickTimer = null;
    var lastClickedElement = null;
    var DOUBLE_CLICK_DELAY = 200; // milliseconds

    // =====================================================
    // HELPER FUNCTIONS
    // =====================================================

    /**
     * Close all open note action dropdown menus
     */
    function closeAllNoteActionMenus() {
        var openMenus = document.querySelectorAll('.note-actions-menu.show');
        openMenus.forEach(function (menu) {
            menu.classList.remove('show');
        });
        var openToggles = document.querySelectorAll('.note-actions-toggle.open');
        openToggles.forEach(function (btn) {
            btn.classList.remove('open');
        });
    }

    /**
     * Extract folder data from an action element
     * @param {HTMLElement} element - The element containing data attributes
     * @returns {{id: number|null, name: string|null}} Folder data
     */
    function getFolderData(element) {
        var folderId = element.getAttribute('data-folder-id');
        var folderName = element.getAttribute('data-folder-name');

        return {
            id: folderId ? parseInt(folderId, 10) : null,
            name: folderName
        };
    }

    /**
     * Execute a folder action with menu cleanup
     * @param {number} folderId - The folder ID
     * @param {Function} callback - The action to execute
     */
    function executeFolderAction(folderId, callback) {
        if (typeof window.closeFolderActionsMenu === 'function') {
            window.closeFolderActionsMenu(folderId);
        }
        if (typeof callback === 'function') {
            callback();
        }
    }

    // =====================================================
    // SEARCH BAR MANAGEMENT
    // =====================================================

    /**
     * Toggle search bar visibility
     */
    function toggleSearchBar() {
        var searchContainer = document.getElementById('search-bar-container');
        var searchInput = document.getElementById('unified-search');
        if (!searchContainer) return;

        var currentDisplay = window.getComputedStyle(searchContainer).display;

        if (currentDisplay === 'none') {
            searchContainer.style.display = 'block';
            localStorage.setItem('searchBarVisible', 'true');

            if (searchInput) {
                setTimeout(function () {
                    searchInput.focus();
                }, 100);
            }
        } else {
            searchContainer.style.display = 'none';
            localStorage.setItem('searchBarVisible', 'false');

            if (window.isSearchMode && typeof window.clearUnifiedSearch === 'function') {
                window.clearUnifiedSearch();
            }
        }
    }

    window.toggleSearchBar = toggleSearchBar;

    /**
     * Handle search type toggle between notes and tags
     * @param {Event} event - The click event
     */
    function handleSearchTypeToggle(event) {
        var button = event.target.closest('.searchbar-type-btn');
        if (!button) return;

        var searchType = button.getAttribute('data-search-type');
        if (!searchType) return;

        // Use SearchManager if available (handles both button state and search execution)
        if (window.searchManager && typeof window.searchManager.handleButtonClick === 'function') {
            window.searchManager.handleButtonClick(searchType, false);
            return;
        }

        // Fallback: manual update if SearchManager not available
        updateSearchTypeUI(button, searchType);
    }

    /**
     * Update search type UI manually (fallback when SearchManager not available)
     * @param {HTMLElement} activeButton - The button that was clicked
     * @param {string} searchType - Either 'notes' or 'tags'
     */
    function updateSearchTypeUI(activeButton, searchType) {
        // Update button states
        var allButtons = document.querySelectorAll('.searchbar-type-btn');
        allButtons.forEach(function (btn) {
            btn.classList.remove('active');
        });
        activeButton.classList.add('active');

        // Update hidden fields and placeholder
        var searchInNotes = document.getElementById('search-in-notes');
        var searchInTags = document.getElementById('search-in-tags');
        var searchInput = document.getElementById('unified-search');

        if (searchType === 'notes') {
            if (searchInNotes) searchInNotes.value = '1';
            if (searchInTags) searchInTags.value = '';
            if (searchInput) {
                searchInput.placeholder = window.t
                    ? window.t('search.placeholder_notes', null, 'Search for one or more words...')
                    : 'Search for one or more words...';
            }
        } else if (searchType === 'tags') {
            if (searchInNotes) searchInNotes.value = '';
            if (searchInTags) searchInTags.value = '1';
            if (searchInput) {
                searchInput.placeholder = window.t
                    ? window.t('search.placeholder_tags', null, 'Search for one or more tags...')
                    : 'Search for one or more tags...';
            }
        }

        if (searchInput) {
            searchInput.focus();
        }
    }

    // =====================================================
    // EVENT HANDLERS
    // =====================================================

    /**
     * Handle navigation actions
     * @param {Event} event - The click event
     * @param {HTMLElement} element - The action element
     */
    function handleNavigation(event, element) {
        event.preventDefault();
        event.stopPropagation();

        var url = element.getAttribute('data-url');
        if (url) {
            window.location = url;
        }
    }

    /**
     * Handle folder menu actions that require folder data
     * @param {Event} event - The click event
     * @param {string} action - The action type
     * @param {HTMLElement} element - The action element
     */
    function handleFolderMenuAction(event, action, element) {
        event.preventDefault();
        event.stopPropagation();

        var folderData = getFolderData(element);
        if (!folderData.id) return;

        var actionMap = {
            'create-note-in-folder': function () {
                if (typeof window.showCreateNoteInFolderModal === 'function') {
                    window.showCreateNoteInFolderModal(folderData.id, folderData.name);
                }
            },
            'move-folder-files': function () {
                if (typeof window.showMoveFolderFilesDialog === 'function') {
                    window.showMoveFolderFilesDialog(folderData.id, folderData.name);
                }
            },
            'move-entire-folder': function () {
                if (typeof window.showMoveEntireFolderDialog === 'function') {
                    window.showMoveEntireFolderDialog(folderData.id, folderData.name);
                }
            },
            'download-folder': function () {
                if (typeof window.downloadFolder === 'function') {
                    window.downloadFolder(folderData.id, folderData.name);
                }
            },
            'rename-folder': function () {
                if (typeof window.editFolderName === 'function') {
                    window.editFolderName(folderData.id, folderData.name);
                }
            },
            'delete-folder': function () {
                if (typeof window.deleteFolder === 'function') {
                    window.deleteFolder(folderData.id, folderData.name);
                }
            },
            'change-folder-icon': function () {
                if (typeof window.showChangeFolderIconModal === 'function') {
                    window.showChangeFolderIconModal(folderData.id, folderData.name);
                }
            },
            'share-folder': function () {
                if (typeof window.openPublicFolderShareModal === 'function') {
                    window.openPublicFolderShareModal(folderData.id);
                }
            }
        };

        if (actionMap[action]) {
            executeFolderAction(folderData.id, actionMap[action]);
        }
    }

    /**
     * Handle Kanban view opening
     * @param {Event} event - The click event
     * @param {HTMLElement} element - The action element
     */
    function handleOpenKanban(event, element) {
        event.preventDefault();
        event.stopImmediatePropagation();

        var folderData = getFolderData(element);

        // Close folder actions menu if opened from there
        if (folderData.id && typeof window.closeFolderActionsMenu === 'function') {
            window.closeFolderActionsMenu(folderData.id);
        }

        if (folderData.id && typeof window.openKanbanView === 'function') {
            window.openKanbanView(folderData.id, folderData.name);
        }
    }

    /**
     * Handle folder sorting
     * @param {Event} event - The click event
     * @param {HTMLElement} element - The action element
     */
    function handleFolderSort(event, element) {
        event.preventDefault();
        event.stopPropagation();

        var folderId = parseInt(element.getAttribute('data-folder-id'), 10);
        var sortType = element.getAttribute('data-sort-type') || 'modified';

        // Update UI: checkmark and active highlighting
        var parentMenu = element.closest('.folder-actions-menu');
        if (parentMenu) {
            var siblings = parentMenu.querySelectorAll('[data-action="sort-folder"]');
            siblings.forEach(function (el) {
                el.classList.remove('active');
            });
            element.classList.add('active');

            // Update header label
            var submenuContainer = element.parentElement;
            if (submenuContainer && submenuContainer.classList.contains('sort-submenu')) {
                var toggleBtn = submenuContainer.previousElementSibling;
                if (toggleBtn && toggleBtn.getAttribute('data-action') === 'toggle-sort-submenu') {
                    var headerLabel = toggleBtn.querySelector('.sort-header-label');
                    var optionLabel = element.querySelector('.sort-option-label');
                    if (headerLabel && optionLabel) {
                        headerLabel.textContent = optionLabel.textContent;
                    }
                }
            }
        }

        if (typeof window.closeFolderActionsMenu === 'function') {
            window.closeFolderActionsMenu(folderId);
        }

        if (folderId && typeof window.sortNotesInFolder === 'function') {
            window.sortNotesInFolder(folderId, sortType);

            // Save sort setting to database
            fetch('api_save_folder_sort.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    folder_id: folderId,
                    sort_type: sortType
                })
            }).catch(function (err) {
                console.error('Failed to save sort setting', err);
            });
        }
    }

    /**
     * Handle opening all notes in a folder in tabs
     * @param {Event} event - The click event
     * @param {HTMLElement} element - The action element
     */
    function handleOpenAllNotesInTabs(event, element) {
        event.preventDefault();
        event.stopPropagation();

        var folderData = getFolderData(element);

        // Close folder actions menu
        if (folderData.id && typeof window.closeFolderActionsMenu === 'function') {
            window.closeFolderActionsMenu(folderData.id);
        }

        if (folderData.id && typeof window.openAllFolderNotesInTabs === 'function') {
            window.openAllFolderNotesInTabs(folderData.id, folderData.name);
        }
    }

    /**
     * Main click event handler using event delegation
     * @param {Event} event - The click event
     */
    function handleNotesListClick(event) {
        var target = event.target;
        var actionElement = target.closest('[data-action]');
        if (!actionElement) return;

        var action = actionElement.getAttribute('data-action');

        // Prevent handling nested actions - only handle the innermost action
        var parentAction = actionElement.parentElement ? actionElement.parentElement.closest('[data-action]') : null;
        if (parentAction && target.closest('[data-action]') !== actionElement) {
            return;
        }

        // Simple actions that just call global functions
        var simpleActions = {
            'toggle-search-bar': function () {
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.toggleSearchBar === 'function') {
                    window.toggleSearchBar();
                }
            },
            'toggle-system-menu': function () {
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.toggleSystemMenu === 'function') {
                    window.toggleSystemMenu();
                }
            },
            'clear-search': function () {
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.clearUnifiedSearch === 'function') {
                    window.clearUnifiedSearch();
                }
            },
            'toggle-favorites': function () {
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.toggleFavorites === 'function') {
                    window.toggleFavorites(actionElement);
                }
            },
            'close-kanban-view': function () {
                event.preventDefault();
                event.stopPropagation();
                if (typeof window.closeKanbanView === 'function') {
                    window.closeKanbanView();
                }
            },
            'toggle-folder-actions-menu': function () {
                event.preventDefault();
                event.stopPropagation();
                var folderId = parseInt(actionElement.getAttribute('data-folder-id'), 10);
                if (folderId && typeof window.toggleFolderActionsMenu === 'function') {
                    window.toggleFolderActionsMenu(folderId);
                }
            },
            'toggle-sort-submenu': function () {
                event.preventDefault();
                event.stopPropagation();
                var chevron = actionElement.querySelector('.sort-chevron');
                var submenu = actionElement.nextElementSibling;

                if (submenu && submenu.classList.contains('sort-submenu')) {
                    var isVisible = submenu.style.display === 'block';
                    submenu.style.display = isVisible ? 'none' : 'block';
                    if (chevron) {
                        chevron.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(90deg)';
                    }
                }
            },
            'toggle-note-actions-menu': function () {
                event.preventDefault();
                event.stopPropagation();
                var noteId = actionElement.getAttribute('data-note-id');
                if (!noteId) return;
                var menu = document.getElementById('note-actions-menu-' + noteId);
                if (!menu) return;
                var isOpen = menu.classList.contains('show');

                // Close all other open note menus first
                closeAllNoteActionMenus();

                if (!isOpen) {
                    // Reset any previously applied manual positioning
                    menu.style.top = '';
                    menu.style.bottom = '';
                    menu.style.left = '';
                    menu.style.right = '0';

                    // Show it first to get its dimensions
                    menu.classList.add('show');
                    actionElement.classList.add('open');

                    if (window.tabManager && typeof window.tabManager.updateUI === 'function') {
                        window.tabManager.updateUI();
                    }

                    // Smart positioning to detect window boundaries
                    var rect = menu.getBoundingClientRect();
                    var windowHeight = window.innerHeight;
                    var windowWidth = window.innerWidth;

                    // Vertical check
                    if (rect.bottom > windowHeight) {
                        // Not enough space below, open upwards
                        menu.style.top = 'auto';
                        menu.style.bottom = '100%';
                        menu.style.marginTop = '0';
                        menu.style.marginBottom = '2px';
                    } else {
                        // Enough space below, ensure default
                        menu.style.top = '100%';
                        menu.style.bottom = 'auto';
                        menu.style.marginTop = '2px';
                        menu.style.marginBottom = '0';
                    }

                    // Horizontal check (ensure it doesn't go off-screen to the right)
                    if (rect.right > windowWidth) {
                        var offset = rect.right - windowWidth + 10;
                        menu.style.right = offset + 'px';
                    }

                    // Minimal check to ensure it doesn't go off-screen to the left
                    if (rect.left < 0) {
                        menu.style.left = '0';
                        menu.style.right = 'auto';
                    }
                }
            }
        };

        // Execute simple action if found
        if (simpleActions[action]) {
            simpleActions[action]();
            return;
        }

        // Navigation actions
        if (['navigate-tags', 'navigate-shared', 'navigate-trash', 'navigate-attachments'].indexOf(action) !== -1) {
            handleNavigation(event, actionElement);
            return;
        }

        // Folder menu actions
        var folderMenuActions = [
            'create-note-in-folder', 'move-folder-files', 'move-entire-folder',
            'download-folder', 'rename-folder', 'delete-folder',
            'change-folder-icon', 'share-folder'
        ];
        if (folderMenuActions.indexOf(action) !== -1) {
            handleFolderMenuAction(event, action, actionElement);
            return;
        }

        // Special cases that need custom handling
        switch (action) {
            case 'select-folder':
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

            case 'open-folder-icon-picker':
                event.preventDefault();
                event.stopImmediatePropagation();
                var folderData = getFolderData(actionElement);
                if (folderData.id && folderData.name && typeof window.showChangeFolderIconModal === 'function') {
                    window.showChangeFolderIconModal(folderData.id, folderData.name);
                }
                break;

            case 'load-note':
                event.preventDefault(); // Always prevent default navigation
                
                var noteLink = actionElement.getAttribute('href');
                var noteId = actionElement.getAttribute('data-note-db-id');
                
                if (!noteLink || !noteId || typeof window.loadNoteDirectly !== 'function') {
                    break;
                }
                
                // Check if this is a double-click (same element clicked within delay)
                if (clickTimer !== null && lastClickedElement === actionElement) {
                    // Double-click detected - open in new tab
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    lastClickedElement = null;
                    
                    if (typeof openNoteInNewTab === 'function') {
                        openNoteInNewTab(noteId);
                    }
                } else {
                    // First click - start timer to load note
                    if (clickTimer !== null) {
                        clearTimeout(clickTimer);
                    }
                    
                    lastClickedElement = actionElement;
                    clickTimer = setTimeout(function() {
                        clickTimer = null;
                        lastClickedElement = null;
                        window.loadNoteDirectly(noteLink, noteId, event, actionElement);
                    }, DOUBLE_CLICK_DELAY);
                }
                break;

            case 'open-kanban-view':
                handleOpenKanban(event, actionElement);
                break;

            case 'sort-folder':
                handleFolderSort(event, actionElement);
                break;

            case 'open-all-notes-in-tabs':
                handleOpenAllNotesInTabs(event, actionElement);
                break;

        }
    }

    /**
     * Handle double-click events (e.g., folder renaming)
     * @param {Event} event - The double-click event
     */
    function handleNotesListDblClick(event) {
        var target = event.target;
        var actionElement = target.closest('[data-dblaction]');
        if (!actionElement) return;

        var action = actionElement.getAttribute('data-dblaction');

        if (action === 'edit-folder-name') {
            var folderData = getFolderData(actionElement);
            if (folderData.id && folderData.name && typeof window.editFolderName === 'function') {
                window.editFolderName(folderData.id, folderData.name);
            }
        } else if (action === 'open-note-new-tab') {
            event.preventDefault();
            var noteId = actionElement.getAttribute('data-note-id');
            if (noteId && typeof openNoteInNewTab === 'function') {
                openNoteInNewTab(noteId);
            }
        }
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize all event listeners and UI state
     */
    function initNotesListEvents() {
        // Restore search bar visibility from localStorage
        var searchContainer = document.getElementById('search-bar-container');
        if (searchContainer) {
            var searchBarVisible = localStorage.getItem('searchBarVisible');
            searchContainer.style.display = (searchBarVisible === 'false') ? 'none' : 'block';
        }

        // Initialize search type button states
        initializeSearchTypeButtons();

        // Ensure favorites section is visible
        var favoritesFolder = document.getElementById('folder-favorites');
        if (favoritesFolder) {
            favoritesFolder.style.display = 'block';
            localStorage.setItem('folder_folder-favorites', 'open');
        }

        // Restore favorites collapsed/expanded state
        restoreFavoritesState();

        // Attach event listeners
        attachEventListeners();
    }

    /**
     * Initialize search type buttons (notes/tags) state
     */
    function initializeSearchTypeButtons() {
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

        // Attach click handlers to type buttons
        var typeButtons = document.querySelectorAll('.searchbar-type-btn');
        typeButtons.forEach(function (btn) {
            btn.addEventListener('click', handleSearchTypeToggle);
        });
    }

    /**
     * Restore favorites section collapsed/expanded state from localStorage
     */
    function restoreFavoritesState() {
        var favoritesCollapsed = localStorage.getItem('favorites_collapsed') === 'true';
        var favoritesHeader = document.querySelector('[data-folder="Favorites"]');
        var favoritesToggleBtn = document.querySelector('[data-action="toggle-favorites"]');

        if (!favoritesHeader) return;

        if (favoritesCollapsed) {
            favoritesHeader.classList.add('favorites-collapsed');
            if (favoritesToggleBtn) {
                favoritesToggleBtn.classList.add('collapsed');
                favoritesToggleBtn.classList.remove('favorites-expanded');
            }
        } else {
            favoritesHeader.classList.remove('favorites-collapsed');
            if (favoritesToggleBtn) {
                favoritesToggleBtn.classList.remove('collapsed');
                favoritesToggleBtn.classList.add('favorites-expanded');
            }
        }
    }

    /**
     * Attach all event listeners
     */
    function attachEventListeners() {
        // Main click event delegation
        document.addEventListener('click', handleNotesListClick);

        // Double-click event delegation
        document.addEventListener('dblclick', handleNotesListDblClick);

        // Close note action menus when clicking outside or on a menu item
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.note-actions') || e.target.closest('.note-actions-menu-item')) {
                closeAllNoteActionMenus();
            }
        });
    }


    /**
     * Reinitialize favorites toggle button event listener
     * NOTE: This function is now deprecated and does nothing.
     * Event delegation on document handles all favorites toggle clicks automatically,
     * even after AJAX refreshes. Keeping this as a no-op for backward compatibility.
     */
    function reinitializeFavoritesToggle() {
        // No operation needed - event delegation handles this automatically
    }

    // =====================================================
    // UTILITY FUNCTIONS
    // =====================================================

    /**
     * Sort notes within a folder DOM element
     * @param {number} folderId - The ID of the folder to sort
     * @param {string} sortType - The sort criteria ('alphabet', 'created', 'modified')
     */
    function sortNotesInFolder(folderId, sortType) {
        var folderContentId = 'folder-' + folderId;
        var folderContent = document.getElementById(folderContentId);
        if (!folderContent) return;

        // Get all note wrapper items (only direct children to avoid subfolder notes)
        // Notes are wrapped in .note-list-item divs; fall back to bare <a> for compatibility
        var noteItems = Array.from(folderContent.querySelectorAll(':scope > .note-list-item'));
        if (noteItems.length === 0) {
            noteItems = Array.from(folderContent.querySelectorAll(':scope > a.links_arbo_left'));
        }
        if (noteItems.length === 0) return;

        // Helper: get the <a> link from a note item (wrapper div or bare anchor)
        function getNoteLink(item) {
            return item.tagName === 'A' ? item : item.querySelector('a.links_arbo_left');
        }

        // Sort the items array based on sort type
        noteItems.sort(function (a, b) {
            var linkA = getNoteLink(a);
            var linkB = getNoteLink(b);
            var valA, valB;

            switch (sortType) {
                case 'alphabet':
                    valA = ((linkA && linkA.querySelector('.note-title')) ? linkA.querySelector('.note-title').textContent : '').toLowerCase();
                    valB = ((linkB && linkB.querySelector('.note-title')) ? linkB.querySelector('.note-title').textContent : '').toLowerCase();
                    return valA.localeCompare(valB);

                case 'created':
                    // Descending order (newest first)
                    valA = (linkA && linkA.getAttribute('data-created')) || '';
                    valB = (linkB && linkB.getAttribute('data-created')) || '';
                    return valA < valB ? 1 : (valA > valB ? -1 : 0);

                case 'modified':
                default:
                    // Descending order (newest first)
                    valA = (linkA && linkA.getAttribute('data-updated')) || '';
                    valB = (linkB && linkB.getAttribute('data-updated')) || '';
                    return valA < valB ? 1 : (valA > valB ? -1 : 0);
            }
        });

        // Find insertion point (before first subfolder if exists)
        var firstSubfolder = folderContent.querySelector(':scope > .folder-header');

        // Use document fragment for better performance
        var fragment = document.createDocumentFragment();

        // Reorder note items with spacers
        noteItems.forEach(function (item) {
            // Remove existing spacer after this item
            var next = item.nextElementSibling;
            if (next && next.id === 'pxbetweennotes') {
                next.remove();
            }

            fragment.appendChild(item);

            // Add spacer between notes
            var spacer = document.createElement('div');
            spacer.id = 'pxbetweennotes';
            fragment.appendChild(spacer);
        });

        // Insert sorted content at appropriate position
        if (firstSubfolder) {
            folderContent.insertBefore(fragment, firstSubfolder);
        } else {
            folderContent.appendChild(fragment);
        }
    }

    // =====================================================
    // EXPOSE PUBLIC API
    // =====================================================

    window.sortNotesInFolder = sortNotesInFolder;
    window.reinitializeFavoritesToggle = reinitializeFavoritesToggle;

    // =====================================================
    // AUTO-INITIALIZATION
    // =====================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNotesListEvents);
    } else {
        initNotesListEvents();
    }

})();