// Notes list event delegation (CSP-compliant)
// This file handles all click events for notes_list.php using event delegation

(function() {
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
                setTimeout(function() {
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
        // Restore search bar state
        var searchContainer = document.getElementById('search-bar-container');
        if (searchContainer) {
            var isVisible = localStorage.getItem('searchBarVisible');
            
            // Force display if search is active
            if (window.isSearchMode) {
                searchContainer.style.display = 'block';
                localStorage.setItem('searchBarVisible', 'true');
            }
            // By default, hide if no active search
            else if (isVisible !== 'true') {
                searchContainer.style.display = 'none';
            }
        }
        
        // Add click event listener with delegation
        document.addEventListener('click', handleNotesListClick);
        
        // Add double-click event listener with delegation
        document.addEventListener('dblclick', handleNotesListDblClick);
    }

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNotesListEvents);
    } else {
        initNotesListEvents();
    }
})();
