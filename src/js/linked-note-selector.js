// Linked Note Selector for Poznote
// Allows selecting a note to create a linked reference to it

(function() {
    'use strict';

    // Use global translation function from globals.js - always call window.t dynamically
    const tr = function(key, vars, fallback) {
        if (typeof window.t === 'function') {
            return window.t(key, vars, fallback);
        }
        // Fallback: do basic variable substitution
        let str = fallback || key;
        if (vars && typeof vars === 'object') {
            for (const k in vars) {
                if (Object.prototype.hasOwnProperty.call(vars, k)) {
                    str = str.split('{{' + k + '}}').join(String(vars[k]));
                }
            }
        }
        return str;
    };

    // Track recently opened notes in localStorage
    const RECENT_NOTES_KEY = 'poznote_recent_notes';
    const RECENT_LINKED_NOTES_LIMIT = 20;
    const SEARCH_LINKED_NOTES_LIMIT = 20;

    /**
     * Get recently opened notes from localStorage
     */
    function getRecentNotes() {
        try {
            const stored = localStorage.getItem(RECENT_NOTES_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Open the linked note selector modal
     */
    window.openLinkedNoteSelectorModal = function() {
        const modal = document.getElementById('linkedNoteSelectorModal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        
        // Clear and focus search input
        const searchInput = document.getElementById('linkedNoteSearch');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 100);
        }
        
        // Load notes list
        loadLinkedNotesList();
    };

    /**
     * Close the linked note selector modal
     */
    window.closeLinkedNoteSelectorModal = function() {
        const modal = document.getElementById('linkedNoteSelectorModal');
        if (modal) {
            modal.style.display = 'none';
        }
    };

    /**
     * Load notes list for linked note selection
     */
    async function loadLinkedNotesList(searchQuery = '') {
        const listContainer = document.getElementById('linkedNoteList');
        const recentLabel = document.querySelector('#linkedNoteSelectorModal .note-reference-recent-label');
        if (!listContainer) return;
        
        listContainer.innerHTML = '<div class="note-reference-loading"><i class="lucide lucide-loader-2 lucide-spin"></i> ' + tr('common.loading', {}, 'Loading...') + '</div>';
        
        try {
            // Get current workspace from global (set by PHP)
            const workspace = (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '') || (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : '') || '';
            
            // Fetch notes from RESTful API
            const response = await fetch(`/api/v1/notes?workspace=${encodeURIComponent(workspace)}`);
            const data = await response.json();
            
            if (!data.success || !data.notes) {
                listContainer.innerHTML = '<div class="note-reference-empty">' + tr('note_reference.empty.no_notes_found', {}, 'No notes found') + '</div>';
                return;
            }
            
            let notes = data.notes;
            
            // If searching, filter by heading
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
                notes = notes.filter(n => {
                    const heading = (n.heading || '').toLowerCase();
                    return heading.includes(query);
                });
                
                if (recentLabel) recentLabel.style.display = 'none';
            } else {
                if (recentLabel) recentLabel.style.display = 'block';
                
                // Get recent notes
                const recentNotes = getRecentNotes();
                const recentIds = recentNotes.map(r => String(r.id));
                
                // Sort: recent notes first, then the rest by updated date
                notes.sort((a, b) => {
                    const aIsRecent = recentIds.indexOf(String(a.id));
                    const bIsRecent = recentIds.indexOf(String(b.id));
                    
                    if (aIsRecent !== -1 && bIsRecent !== -1) {
                        return aIsRecent - bIsRecent;
                    } else if (aIsRecent !== -1) {
                        return -1;
                    } else if (bIsRecent !== -1) {
                        return 1;
                    }
                    return new Date(b.updated) - new Date(a.updated);
                });
            }
            
            // Limit displayed notes
            const displayNotes = notes.slice(0, searchQuery ? SEARCH_LINKED_NOTES_LIMIT : RECENT_LINKED_NOTES_LIMIT);
            
            if (displayNotes.length === 0) {
                listContainer.innerHTML = '<div class="note-reference-empty">' + tr('note_reference.empty.no_notes_found', {}, 'No notes found') + '</div>';
                return;
            }
            
            // Render notes list
            listContainer.innerHTML = '';
            displayNotes.forEach(note => {
                const item = document.createElement('div');
                item.className = 'note-reference-item';
                item.setAttribute('data-note-id', note.id);
                item.setAttribute('data-note-heading', note.heading || tr('index.note.untitled', {}, 'Untitled'));
                
                const icon = document.createElement('i');
                icon.className = 'lucide lucide-file-text note-reference-icon';
                
                const heading = document.createElement('span');
                heading.className = 'note-reference-heading';
                heading.textContent = note.heading || tr('index.note.untitled', {}, 'Untitled');
                
                item.appendChild(icon);
                item.appendChild(heading);
                
                // Click handler
                item.addEventListener('click', function() {
                    const noteId = this.getAttribute('data-note-id');
                    const noteHeading = this.getAttribute('data-note-heading');
                    // Open folder selector modal
                    openLinkedNoteFolderSelectorModal(noteId, noteHeading);
                });
                
                listContainer.appendChild(item);
            });

                            const visibleItems = listContainer.querySelectorAll('.note-reference-item');
                            if (visibleItems.length > 4) {
                                let visibleHeight = 0;
                                for (let index = 0; index < 4; index++) {
                                    visibleHeight += visibleItems[index].offsetHeight;
                                }
                                listContainer.style.height = visibleHeight + 'px';
                                listContainer.style.maxHeight = visibleHeight + 'px';
                                listContainer.style.overflowY = 'scroll';
                                listContainer.style.scrollbarGutter = 'stable';
                            } else {
                                listContainer.style.height = '';
                                listContainer.style.maxHeight = '';
                                listContainer.style.overflowY = '';
                                listContainer.style.scrollbarGutter = '';
                            }
            
        } catch (error) {
            console.error('Error loading notes for linking:', error);
            listContainer.innerHTML = '<div class="note-reference-error">' + tr('ui.alerts.network_error', {}, 'Network error') + '</div>';
        }
    }

    /**
     * Open the folder selector modal for the linked note
     */
    async function openLinkedNoteFolderSelectorModal(noteId, noteHeading) {
        const modal = document.getElementById('linkedNoteFolderSelectorModal');
        const searchInput = document.getElementById('linkedNoteFolderSearch');

        if (!modal || !searchInput) {
            console.error('Folder selector modal elements not found');
            // Fallback to creating linked note without folder selection
            createLinkedNote(noteId, noteHeading, null);
            return;
        }

        // Close the note selector modal
        closeLinkedNoteSelectorModal();

        // Store noteId and noteHeading for later use
        modal.dataset.noteId = noteId;
        modal.dataset.noteHeading = noteHeading;

        // Reset search input
        searchInput.value = '';

        // Load folders list
        loadLinkedFoldersList();

        // Show modal
        modal.style.display = 'flex';

        // Focus search input
        setTimeout(() => searchInput.focus(), 100);
    }

    /**
     * Load folders list for linked note folder selection
     */
    async function loadLinkedFoldersList(searchQuery = '') {
        const listContainer = document.getElementById('linkedFolderList');
        if (!listContainer) return;

        listContainer.innerHTML = '<div class="note-reference-loading"><i class="lucide lucide-loader-2 lucide-spin"></i> ' + tr('common.loading', {}, 'Loading...') + '</div>';

        try {
            const workspace = (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '') || (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : '') || '';
            const response = await fetch(`/api/v1/notes?get_folders=1&workspace=${encodeURIComponent(workspace)}`);
            const data = await response.json();

            // Convert folders object to array (API returns object with JSON_FORCE_OBJECT)
            let foldersArray = [];
            if (data.folders) {
                if (Array.isArray(data.folders)) {
                    foldersArray = data.folders;
                } else {
                    foldersArray = Object.values(data.folders);
                }
            }

            // Filter by search query if provided
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase().trim();
                foldersArray = foldersArray.filter(f => {
                    const name = (f.name || '').toLowerCase();
                    const path = (f.path || '').toLowerCase();
                    return name.includes(query) || path.includes(query);
                });
            }

            // Sort folders by full path so hierarchy stays readable
            foldersArray.sort((a, b) => (a.path || a.name || '').localeCompare(b.path || b.name || ''));

            // Render folders list
            listContainer.innerHTML = '';

            // Add root option first
            const rootItem = document.createElement('div');
            rootItem.className = 'note-reference-item';
            rootItem.setAttribute('data-folder-id', '');

            const rootIcon = document.createElement('i');
            rootIcon.className = 'lucide lucide-folder note-reference-icon';

            const rootName = document.createElement('span');
            rootName.className = 'note-reference-heading';
            rootName.textContent = tr('modals.linked_folder_selector.root', {}, 'Root (No folder)');

            rootItem.appendChild(rootIcon);
            rootItem.appendChild(rootName);

            rootItem.addEventListener('click', function() {
                const modal = document.getElementById('linkedNoteFolderSelectorModal');
                const noteId = modal.dataset.noteId;
                const noteHeading = modal.dataset.noteHeading;
                closeLinkedNoteFolderSelectorModal();
                createLinkedNote(noteId, noteHeading, null);
            });

            listContainer.appendChild(rootItem);

            // Add folder items
            foldersArray.forEach(folder => {
                const item = document.createElement('div');
                item.className = 'note-reference-item';
                item.setAttribute('data-folder-id', folder.id);

                const icon = document.createElement('i');
                icon.className = 'lucide lucide-folder note-reference-icon';

                const name = document.createElement('span');
                name.className = 'note-reference-heading';
                name.textContent = folder.path || folder.name;
                name.title = folder.path || folder.name;

                item.appendChild(icon);
                item.appendChild(name);

                item.addEventListener('click', function() {
                    const folderId = this.getAttribute('data-folder-id');
                    const modal = document.getElementById('linkedNoteFolderSelectorModal');
                    const noteId = modal.dataset.noteId;
                    const noteHeading = modal.dataset.noteHeading;
                    closeLinkedNoteFolderSelectorModal();
                    createLinkedNote(noteId, noteHeading, folderId);
                });

                listContainer.appendChild(item);
            });

            const visibleItems = listContainer.querySelectorAll('.note-reference-item');
            if (visibleItems.length > 4) {
                let visibleHeight = 0;
                for (let index = 0; index < 4; index++) {
                    visibleHeight += visibleItems[index].offsetHeight;
                }
                listContainer.style.height = visibleHeight + 'px';
                listContainer.style.maxHeight = visibleHeight + 'px';
                listContainer.style.overflowY = 'scroll';
                listContainer.style.scrollbarGutter = 'stable';
            } else {
                listContainer.style.height = '';
                listContainer.style.maxHeight = '';
                listContainer.style.overflowY = '';
                listContainer.style.scrollbarGutter = '';
            }

        } catch (error) {
            console.error('Error loading folders:', error);
            listContainer.innerHTML = '<div class="note-reference-error">' + tr('ui.alerts.network_error', {}, 'Network error') + '</div>';
        }
    }

    /**
     * Close the folder selector modal
     */
    function closeLinkedNoteFolderSelectorModal() {
        const modal = document.getElementById('linkedNoteFolderSelectorModal');
        if (modal) {
            modal.style.display = 'none';
            delete modal.dataset.noteId;
            delete modal.dataset.noteHeading;
        }
    }

    /**
     * Create a linked note to the selected note
     */
    async function createLinkedNote(noteId, noteHeading, folderId = null) {
        try {
            // Get current workspace
            const workspace = (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '') || (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : '') || '';
            
            // Ensure noteHeading has a valid value
            const validHeading = noteHeading && noteHeading.trim() ? noteHeading.trim() : tr('index.note.untitled', {}, 'Untitled');
            
            // Create request data
            const requestData = {
                type: 'linked',
                linked_note_id: noteId,
                heading: tr('modals.create.linked.default_heading', { note: validHeading }, 'Link to {{note}}'),
                workspace: workspace
            };
            
            // Add folder if specified
            if (folderId) {
                requestData.folder_id = folderId;
            }
            
            // Call the backend to create linked note
            const response = await fetch('/api/v1/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (data.success && data.note && data.note.id) {
                // Success - open the linked note immediately.
                // `note` triggers backend linked-note resolution, while `select_linked_note`
                // keeps the shortcut highlighted in the sidebar.
                let url = 'index.php?workspace=' + encodeURIComponent(workspace) + '&note=' + encodeURIComponent(data.note.id) + '&select_linked_note=' + encodeURIComponent(data.note.id);
                
                // Add expand_folder parameter to force folder expansion on load
                if (data.note.folder_id) {
                    url += '&expand_folder=' + encodeURIComponent(data.note.folder_id);
                }
                
                // Reload the page to show the new note
                window.location.href = url;
            } else {
                // Error
                const errorMsg = data.error || tr('modals.create.linked.error', {}, 'Error creating shortcut');
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup(errorMsg, 'error');
                }
            }
        } catch (error) {
            console.error('Error creating linked note:', error);
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(tr('ui.alerts.network_error', {}, 'Network error'), 'error');
            }
        }
    }

    // Search input handlers
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('linkedNoteSearch');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', function() {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    loadLinkedNotesList(this.value);
                }, 300);
            });
        }

        // Folder search input handler
        const folderSearchInput = document.getElementById('linkedNoteFolderSearch');
        if (folderSearchInput) {
            let searchTimeout;
            folderSearchInput.addEventListener('input', function() {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    loadLinkedFoldersList(this.value);
                }, 300);
            });
        }
    });

    // Expose functions globally
    window.openLinkedNoteSelectorModal = openLinkedNoteSelectorModal;
    window.closeLinkedNoteSelectorModal = closeLinkedNoteSelectorModal;
    window.openLinkedNoteFolderSelectorModal = openLinkedNoteFolderSelectorModal;
    window.closeLinkedNoteFolderSelectorModal = closeLinkedNoteFolderSelectorModal;
    
    /**
     * Create a linked note from the current note
     * This creates a new note that links to the currently open note
     */
    window.createLinkedNoteFromCurrent = async function() {
        try {
            // Get the currently selected note ID
            const selectedNote = document.querySelector('.notecard');
            if (!selectedNote) {
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup(tr('folders.move_note.select_note_first', {}, 'Please select a note first'), 'error');
                }
                return;
            }

            const noteId = selectedNote.id.replace('note', '');
            if (!noteId) {
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup(tr('folders.move_note.select_note_first', {}, 'Please select a note first'), 'error');
                }
                return;
            }

            // Get the note title from the input field
            const noteTitleInput = document.getElementById('inp' + noteId);
            const noteHeading = noteTitleInput ? (noteTitleInput.value || noteTitleInput.placeholder || tr('index.note.new_note', {}, 'New note')) : tr('index.note.new_note', {}, 'New note');

            // Open folder selector modal for this note
            openLinkedNoteFolderSelectorModal(noteId, noteHeading);

        } catch (error) {
            console.error('Error creating linked note from current:', error);
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(tr('ui.alerts.network_error', {}, 'Network error'), 'error');
            }
        }
    };

})();
