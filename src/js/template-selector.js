// Template Note Selector for Poznote
// Allows selecting a note to create as a template

(function() {
    'use strict';

    // Use global translation function from globals.js
    const tr = window.t || function(key, vars, fallback) {
        return fallback || key;
    };

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
     * Open the template note selector modal
     */
    window.openTemplateNoteSelectorModal = function() {
        const modal = document.getElementById('templateNoteSelectorModal');
        if (!modal) return;
        
        modal.style.display = 'flex';
        
        // Clear and focus search input
        const searchInput = document.getElementById('templateNoteSearch');
        if (searchInput) {
            searchInput.value = '';
            setTimeout(() => searchInput.focus(), 100);
        }
        
        // Load notes list
        loadTemplateNotesList();
    };

    /**
     * Close the template note selector modal
     */
    window.closeTemplateNoteSelectorModal = function() {
        const modal = document.getElementById('templateNoteSelectorModal');
        if (modal) {
            modal.style.display = 'none';
        }
    };

    /**
     * Load notes list for template selection
     */
    async function loadTemplateNotesList(searchQuery = '') {
        const listContainer = document.getElementById('templateNoteList');
        const recentLabel = document.querySelector('#templateNoteSelectorModal .note-reference-recent-label');
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
                    createTemplateFromNote(noteId, noteHeading);
                });
                
                listContainer.appendChild(item);
            });
            
        } catch (error) {
            console.error('Error loading notes for template:', error);
            listContainer.innerHTML = '<div class="note-reference-error">' + tr('ui.alerts.network_error', {}, 'Network error') + '</div>';
        }
    }

    /**
     * Create a template from the selected note
     */
    async function createTemplateFromNote(noteId, noteHeading) {
        try {
            // Close the modal
            closeTemplateNoteSelectorModal();
            
            // Call the backend to create template
            const response = await fetch('/api/v1/notes/' + encodeURIComponent(noteId) + '/create-template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin'
            });
            
            const data = await response.json();
            
            if (data.success && data.id) {
                // Success - open the created template
                const workspace = (typeof getSelectedWorkspace === 'function' ? getSelectedWorkspace() : '') || (typeof selectedWorkspace !== 'undefined' ? selectedWorkspace : '') || '';
                let url = 'index.php?note=' + encodeURIComponent(data.id) + '&workspace=' + encodeURIComponent(workspace);
                
                // Add expand_folder parameter to force folder expansion on load
                if (data.folder_id) {
                    url += '&expand_folder=' + encodeURIComponent(data.folder_id);
                }
                
                window.location.href = url;
            } else {
                // Error
                const errorMsg = data.error || tr('template.error', {}, 'Error creating template');
                if (typeof showNotificationPopup === 'function') {
                    showNotificationPopup(errorMsg, 'error');
                }
            }
        } catch (error) {
            console.error('Error creating template:', error);
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(tr('ui.alerts.network_error', {}, 'Network error'), 'error');
            }
        }
    }

    // Search input handler
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('templateNoteSearch');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', function() {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    loadTemplateNotesList(this.value);
                }, 300);
            });
        }
    });

    // Expose functions globally
    window.openTemplateNoteSelectorModal = openTemplateNoteSelectorModal;
    window.closeTemplateNoteSelectorModal = closeTemplateNoteSelectorModal;

})();
