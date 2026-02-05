// Linked Note Selector for Poznote
// Allows selecting a note to create a linked reference to it

(function() {
    'use strict';

    function tr(key, vars, fallback) {
        try {
            if (typeof window !== 'undefined' && typeof window.t === 'function') {
                return window.t(key, vars || {}, fallback);
            }
        } catch (e) {
            // ignore
        }
        let text = (fallback !== undefined && fallback !== null) ? String(fallback) : String(key);
        if (vars && typeof vars === 'object') {
            Object.keys(vars).forEach((k) => {
                text = text.replaceAll('{{' + k + '}}', String(vars[k]));
            });
        }
        return text;
    }

    // Track recently opened notes in localStorage
    const RECENT_NOTES_KEY = 'poznote_recent_notes';

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
        
        listContainer.innerHTML = '<div class="note-reference-loading"><i class="fa-spinner fa-spin"></i> ' + tr('common.loading', {}, 'Loading...') + '</div>';
        
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
            const displayNotes = notes.slice(0, searchQuery ? 20 : 10);
            
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
                icon.className = 'fa fa-file-alt note-reference-icon';
                
                const heading = document.createElement('span');
                heading.className = 'note-reference-heading';
                heading.textContent = note.heading || tr('index.note.untitled', {}, 'Untitled');
                
                item.appendChild(icon);
                item.appendChild(heading);
                
                // Click handler
                item.addEventListener('click', function() {
                    const noteId = this.getAttribute('data-note-id');
                    const noteHeading = this.getAttribute('data-note-heading');
                    createLinkedNote(noteId, noteHeading);
                });
                
                listContainer.appendChild(item);
            });
            
        } catch (error) {
            console.error('Error loading notes for linking:', error);
            listContainer.innerHTML = '<div class="note-reference-error">' + tr('ui.alerts.network_error', {}, 'Network error') + '</div>';
        }
    }

    /**
     * Create a linked note to the selected note
     */
    async function createLinkedNote(noteId, noteHeading) {
        try {
            // Close the modal
            closeLinkedNoteSelectorModal();
            
            // Get current workspace and folder settings
            const workspace = (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '') || (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : '') || '';
            const folderId = (typeof selectedFolderId !== 'undefined' && selectedFolderId) || window.targetFolderId || null;
            
            // Create request data
            const requestData = {
                type: 'linked',
                linked_note_id: noteId,
                heading: tr('modals.create.linked.default_heading', { note: noteHeading }, 'Link to {{note}}'),
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
                // Success - redirect to the notes list or open the linked note
                let url = 'index.php?workspace=' + encodeURIComponent(workspace);
                
                // Add expand_folder parameter to force folder expansion on load
                if (data.note.folder_id) {
                    url += '&expand_folder=' + encodeURIComponent(data.note.folder_id);
                }
                
                // Reload the page to show the new note
                window.location.href = url;
            } else {
                // Error
                const errorMsg = data.error || tr('modals.create.linked.error', {}, 'Error creating linked note');
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

    // Search input handler
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
    });

    // Expose functions globally
    window.openLinkedNoteSelectorModal = openLinkedNoteSelectorModal;
    window.closeLinkedNoteSelectorModal = closeLinkedNoteSelectorModal;
    
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
            
            // Get current workspace
            const workspace = (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '') || (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : '') || '';
            
            // Create request data
            const requestData = {
                type: 'linked',
                linked_note_id: noteId,
                heading: noteHeading,
                workspace: workspace
            };
            
            // Call the backend to create linked note
            const response = await fetch('/api/v1/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (data.success && data.note && data.note.id) {
                // Success - redirect to the newly created linked note
                let url = 'index.php?workspace=' + encodeURIComponent(workspace) + '&note=' + encodeURIComponent(data.note.id);
                
                // Add expand_folder parameter to force folder expansion on load
                if (data.note.folder_id) {
                    url += '&expand_folder=' + encodeURIComponent(data.note.folder_id);
                }
                
                // Reload the page to show the new note
                window.location.href = url;
            } else {
                // Error
                const errorMsg = data.error || tr('modals.create.linked.error', {}, 'Error creating linked note');
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup(errorMsg, 'error');
                }
            }
        } catch (error) {
            console.error('Error creating linked note from current:', error);
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(tr('ui.alerts.network_error', {}, 'Network error'), 'error');
            }
        }
    };

})();
