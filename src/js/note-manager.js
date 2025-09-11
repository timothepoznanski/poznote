/**
 * Note Management Module
 * Handles note creation, editing, saving, and deletion
 */

const NoteManager = {
    /**
     * Initialize note management functionality
     */
    init() {
        this.setupEventListeners();
        this.setupAutoSave();
        this.setupBeforeUnloadWarning();
    },

    /**
     * Setup event listeners for note editing
     */
    setupEventListeners() {
        // Handle input events for note editing
        ['keyup', 'input', 'paste'].forEach(eventType => {
            document.body.addEventListener(eventType, (e) => {
                if (e.target.classList.contains('name_doss')) {
                    if (AppState.isUpdateInProgress()) {
                        NotificationManager.show("Save in progress.");
                    } else {
                        this.markNoteAsEdited();
                    }
                } else if (e.target.classList.contains('noteentry')) {
                    if (AppState.isUpdateInProgress()) {
                        NotificationManager.show("Automatic save in progress, please do not modify the note.");
                    } else {
                        this.markNoteAsEdited();
                    }
                } else if (e.target.tagName === 'INPUT') {
                    // Skip search and filter inputs
                    if (
                        e.target.classList.contains('searchbar') ||
                        e.target.id === 'search' ||
                        e.target.classList.contains('searchtrash') ||
                        e.target.id === 'myInputFiltrerTags'
                    ) {
                        return;
                    }
                    
                    // Handle note input fields
                    if (
                        e.target.classList.contains('css-title') ||
                        (e.target.id && e.target.id.startsWith('inp')) ||
                        (e.target.id && e.target.id.startsWith('tags'))
                    ) {
                        if (AppState.isUpdateInProgress()) {
                            NotificationManager.show("Save in progress.");
                        } else {
                            this.markNoteAsEdited();
                        }
                    }
                }
            });
        });

        // Handle space key for tag separation in classic tag inputs
        document.body.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' && 
                e.target.id && 
                e.target.id.startsWith('tags') &&
                !e.target.classList.contains('tag-input')) {
                
                if (e.key === ' ') {
                    this.handleTagSeparation(e);
                }
            }
        });

        // Reset noteId when search bar receives focus
        document.body.addEventListener('focusin', (e) => {
            if (e.target.classList.contains('searchbar') || 
                e.target.id === 'search' || 
                e.target.classList.contains('searchtrash')) {
                AppState.setNoteId(-1);
            }
        });
    },

    /**
     * Handle tag separation with space key
     */
    handleTagSeparation(event) {
        const input = event.target;
        const currentValue = input.value;
        const cursorPos = input.selectionStart;
        
        const textBeforeCursor = currentValue.substring(0, cursorPos);
        const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
        const currentTag = textBeforeCursor.substring(lastSpaceIndex + 1).trim();
        
        if (currentTag && currentTag.length > 0) {
            event.preventDefault();
            
            const charAfterCursor = currentValue.charAt(cursorPos);
            if (charAfterCursor !== ' ' && charAfterCursor !== '') {
                input.value = currentValue.substring(0, cursorPos) + ' ' + currentValue.substring(cursorPos);
                input.selectionStart = input.selectionEnd = cursorPos + 1;
            } else {
                input.selectionStart = input.selectionEnd = cursorPos + 1;
            }
            
            this.markNoteAsEdited();
        }
    },

    /**
     * Setup auto-save functionality
     */
    setupAutoSave() {
        if (!AppState.isNoteEdited()) {
            setInterval(() => {
                this.checkAndAutoSave();
            }, 2000);
        }
    },

    /**
     * Setup warning before page unload if note is modified
     */
    setupBeforeUnloadWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (
                AppState.isNoteEdited() &&
                !AppState.isUpdateInProgress() &&
                AppState.getNoteId() !== -1 &&
                AppState.getNoteId() !== 'search'
            ) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        });
    },

    /**
     * Update note ID when element gets focus
     */
    updateNoteId(element, prefix) {
        const noteId = element.id.substr(prefix.length);
        AppState.setNoteId(noteId);
    },

    /**
     * Mark note as edited and update UI
     */
    markNoteAsEdited() {
        const noteId = AppState.getNoteId();
        if (noteId === 'search' || noteId === -1 || noteId === null || noteId === undefined) {
            return;
        }
        
        AppState.setNoteEdited(true);
        const currentTime = new Date().getTime();
        AppState.setLastUpdate(currentTime);
        this.displayEditInProgress();
    },

    /**
     * Create a new note
     */
    createNote() {
        const params = new URLSearchParams({
            now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
            folder: AppState.getSelectedFolder(),
            workspace: AppState.getSelectedWorkspace()
        });

        fetch("insert_new.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest' },
            body: params.toString()
        })
        .then(response => response.text())
        .then(data => {
            try {
                const result = typeof data === 'string' ? JSON.parse(data) : data;
                if (result.status === 1) {
                    window.scrollTo(0, 0);
                    const workspace = encodeURIComponent(AppState.getSelectedWorkspace());
                    window.location.href = `index.php?workspace=${workspace}&note=${encodeURIComponent(result.heading)}`;
                } else {
                    NotificationManager.show(result.error || data, 'error');
                }
            } catch(e) {
                NotificationManager.show('Error creating note: ' + data, 'error');
            }
        })
        .catch(error => {
            console.error('Error creating note:', error);
            NotificationManager.show('Network error while creating note', 'error');
        });
    },

    /**
     * Update/save the current note
     */
    updateNote() {
        AppState.setUpdateInProgress(true);
        const noteId = AppState.getNoteId();

        if (!noteId || noteId === -1 || noteId === '' || noteId === null || noteId === undefined) {
            console.error('updateNote: invalid noteId', noteId);
            AppState.setUpdateInProgress(false);
            return;
        }

        const elements = this.getNoteElements(noteId);
        if (!elements.titleInput || !elements.entryElement) {
            console.error('updateNote: missing title or entry element for noteId=', noteId);
            AppState.setUpdateInProgress(false);
            AppState.setNoteEdited(true);
            return;
        }

        const noteData = this.extractNoteData(elements);
        this.saveNoteToServer(noteId, noteData);
    },

    /**
     * Get note elements from DOM
     */
    getNoteElements(noteId) {
        return {
            titleInput: document.getElementById("inp" + noteId),
            entryElement: document.getElementById("entry" + noteId),
            tagsElement: document.getElementById("tags" + noteId),
            folderElement: document.getElementById("folder" + noteId)
        };
    },

    /**
     * Extract note data from DOM elements
     */
    extractNoteData(elements) {
        const title = (elements.titleInput && elements.titleInput.tagName === 'INPUT') 
            ? elements.titleInput.value : '';
        
        let content = "";
        if (elements.entryElement) {
            const cloned = elements.entryElement.cloneNode(true);
            content = this.cleanSearchHighlightsFromElement(cloned);
        }
        
        content = content.replace(/<br\s*[\/]?>/gi, "&nbsp;<br>");
        
        let textContent = "";
        if (elements.entryElement) {
            const clonedElement = elements.entryElement.cloneNode(true);
            const highlights = clonedElement.querySelectorAll('.search-highlight');
            highlights.forEach(highlight => {
                const parent = highlight.parentNode;
                parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                parent.normalize();
            });
            textContent = clonedElement.textContent || "";
        }

        const tags = elements.tagsElement ? elements.tagsElement.value : '';
        const folder = elements.folderElement ? elements.folderElement.value : AppState.getDefaultFolderName();

        return {
            title,
            content,
            textContent,
            tags,
            folder
        };
    },

    /**
     * Save note data to server
     */
    saveNoteToServer(noteId, noteData) {
        const params = new URLSearchParams({
            id: noteId,
            tags: noteData.tags,
            folder: noteData.folder,
            heading: noteData.title,
            entry: noteData.content,
            workspace: AppState.getSelectedWorkspace(),
            entrycontent: noteData.textContent,
            now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60
        });

        fetch("update_note.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString()
        })
        .then(response => response.text())
        .then(data => {
            this.handleSaveResponse(noteId, data);
        })
        .catch(error => {
            console.error('Network error while saving:', error);
            NotificationManager.show('Network error while saving: ' + error.message, 'error');
            AppState.setNoteEdited(true);
            AppState.setUpdateInProgress(false);
            this.setSaveButtonState(true);
        });
    },

    /**
     * Handle save response from server
     */
    handleSaveResponse(noteId, data) {
        try {
            const jsonData = JSON.parse(data);
            if (jsonData.status === 'error') {
                NotificationManager.show('Error saving note: ' + jsonData.message, 'error');
                AppState.setNoteEdited(true);
                AppState.setUpdateInProgress(false);
                this.setSaveButtonState(true);
                return;
            } else if (jsonData.date && jsonData.title) {
                this.handleSuccessfulSaveWithTitleChange(noteId, jsonData);
                return;
            }
        } catch(e) {
            // Handle non-JSON responses
            this.handleSuccessfulSave(noteId, data);
        }
    },

    /**
     * Handle successful save with title change
     */
    handleSuccessfulSaveWithTitleChange(noteId, jsonData) {
        AppState.setNoteEdited(false);
        this.updateLastSavedDisplay(noteId, jsonData.date);
        
        if (jsonData.title !== jsonData.original_title) {
            const titleInput = document.getElementById('inp' + noteId);
            if (titleInput) {
                titleInput.value = jsonData.title;
            }
        }
        
        this.updateNoteTitleInLeftColumn();
        AppState.setUpdateInProgress(false);
        this.setSaveButtonState(false);
    },

    /**
     * Handle successful save
     */
    handleSuccessfulSave(noteId, data) {
        AppState.setNoteEdited(false);
        
        if (data === '1') {
            this.updateLastSavedDisplay(noteId, 'Last Saved Today');
        } else {
            this.updateLastSavedDisplay(noteId, data);
        }
        
        this.updateNoteTitleInLeftColumn();
        AppState.setUpdateInProgress(false);
        this.setSaveButtonState(false);
        
        // Refresh new notes display
        const newNotesElement = document.getElementById('newnotes');
        if (newNotesElement) {
            newNotesElement.style.display = 'none';
            void newNotesElement.offsetWidth;
            newNotesElement.style.display = '';
        }
    },

    /**
     * Delete a note
     */
    deleteNote(noteId) {
        const params = new URLSearchParams({ id: noteId });
        
        fetch("delete_note.php", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString()
        })
        .then(response => response.text())
        .then(data => {
            this.handleDeleteResponse(data);
        })
        .catch(error => {
            console.error('Network error while deleting:', error);
            NotificationManager.show('Network error while deleting: ' + error.message, 'error');
        });
    },

    /**
     * Handle delete response
     */
    handleDeleteResponse(data) {
        const trimmed = (data || '').trim();
        const workspace = AppState.getSelectedWorkspace();
        const redirectUrl = `index.php?workspace=${encodeURIComponent(workspace)}`;
        
        if (trimmed === '1') {
            window.location.href = redirectUrl;
            return;
        }
        
        try {
            const jsonData = JSON.parse(trimmed);
            if (jsonData === 1 || (jsonData && (jsonData.status === 'ok' || jsonData.status === 'success'))) {
                window.location.href = redirectUrl;
                return;
            }
            
            if (jsonData && jsonData.status === 'error') {
                NotificationManager.show('Error deleting note: ' + (jsonData.message || 'Unknown error'), 'error');
                return;
            }
            
            // Fallback redirect
            window.location.href = redirectUrl;
        } catch(e) {
            NotificationManager.show('Error deleting note: ' + trimmed, 'error');
        }
    },

    /**
     * Save focused note manually
     */
    saveFocusedNote() {
        const noteId = AppState.getNoteId();
        
        if (noteId === -1 || noteId === null || noteId === undefined || noteId === '') {
            NotificationManager.show("Click anywhere in the note to be saved, then try again.");
            return;
        }
        
        if (!AppState.isUpdateInProgress() && AppState.isNoteEdited()) {
            this.displaySavingInProgress();
            this.updateNote();
        } else if (AppState.isUpdateInProgress()) {
            NotificationManager.show("Save already in progress.");
        } else {
            NotificationManager.show("No changes to save.");
        }
    },

    /**
     * Check if auto-save should be triggered
     */
    checkAndAutoSave() {
        const noteId = AppState.getNoteId();
        if (noteId === -1) return;
        
        const currentTime = new Date().getTime();
        const lastUpdate = AppState.getLastUpdate();
        
        if (!AppState.isUpdateInProgress() && 
            AppState.isNoteEdited() && 
            lastUpdate &&
            currentTime - lastUpdate > 15000) {
            
            this.displaySavingInProgress();
            this.updateNote();
        }
    },

    /**
     * Clean search highlights from element
     */
    cleanSearchHighlightsFromElement(element) {
        if (!element) return "";
        
        const clonedElement = element.cloneNode(true);
        const highlights = clonedElement.querySelectorAll('.search-highlight');
        
        highlights.forEach(highlight => {
            const parent = highlight.parentNode;
            parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
            parent.normalize();
        });
        
        return clonedElement.innerHTML;
    },

    /**
     * Update note title in left column
     */
    updateNoteTitleInLeftColumn() {
        const noteId = AppState.getNoteId();
        if (noteId === 'search' || noteId === -1 || noteId === null || noteId === undefined) {
            return;
        }
        
        const titleInput = document.getElementById('inp' + noteId);
        if (!titleInput) return;
        
        let newTitle = titleInput.value.trim();
        if (newTitle === '') newTitle = 'Untitled note';
        
        const elementsToUpdate = [];
        
        // Find elements to update by database ID
        const noteLinksById = document.querySelectorAll(`[data-note-db-id="${noteId}"]`);
        noteLinksById.forEach(link => elementsToUpdate.push(link));
        
        // Find selected note if no database ID matches
        if (elementsToUpdate.length === 0) {
            const selectedNote = document.querySelector('.links_arbo_left.selected-note');
            if (selectedNote) {
                elementsToUpdate.push(selectedNote);
            }
        }
        
        // Update all found elements
        elementsToUpdate.forEach(element => {
            this.updateTitleInElement(element, newTitle);
        });
    },

    /**
     * Update title in a specific element
     */
    updateTitleInElement(linkElement, newTitle) {
        const titleSpan = linkElement.querySelector('.note-title');
        if (titleSpan) {
            titleSpan.textContent = newTitle;
            
            const href = linkElement.getAttribute('href');
            if (href) {
                const url = new URL(href, window.location.origin);
                url.searchParams.set('note', newTitle);
                linkElement.setAttribute('href', url.toString());
            }
            
            linkElement.setAttribute('data-note-id', newTitle);
        }
    },

    /**
     * Display UI states
     */
    displaySavingInProgress() {
        const noteId = AppState.getNoteId();
        const element = document.getElementById('lastupdated' + noteId);
        if (element) {
            element.innerHTML = '<span style="color:#FF0000";>Saving in progress...</span>';
        }
        this.setSaveButtonState(true);
    },

    displayEditInProgress() {
        const noteId = AppState.getNoteId();
        const element = document.getElementById('lastupdated' + noteId);
        if (element) {
            element.innerHTML = '<span>Editing in progress...</span>';
        }
        this.setSaveButtonState(true);
    },

    updateLastSavedDisplay(noteId, text) {
        const element = document.getElementById('lastupdated' + noteId);
        if (element) {
            element.innerHTML = text;
        }
    },

    /**
     * Set save button visual state
     */
    setSaveButtonState(isUnsaved) {
        let saveButton = document.querySelector('.toolbar-btn > .fa-save')?.parentElement;
        
        if (!saveButton) {
            const buttons = document.querySelectorAll('.toolbar-btn');
            buttons.forEach(btn => {
                if (btn.querySelector('.fa-save')) {
                    saveButton = btn;
                }
            });
        }
        
        if (saveButton) {
            if (isUnsaved) {
                saveButton.style.color = '#FF0000';
                saveButton.style.backgroundColor = '#FFE5E5';
            } else {
                saveButton.style.color = '';
                saveButton.style.backgroundColor = '';
            }
        }
    }
};

// Legacy global functions for backward compatibility
function updateidsearch(el) { NoteManager.updateNoteId(el, 'entry'); }
function updateidhead(el) { NoteManager.updateNoteId(el, 'inp'); }
function updateidtags(el) { NoteManager.updateNoteId(el, 'tags'); }
function updateidfolder(el) { NoteManager.updateNoteId(el, 'folder'); }
function updateident(el) { NoteManager.updateNoteId(el, 'entry'); }
function updatenote() { NoteManager.updateNote(); }
function newnote() { NoteManager.createNote(); }
function deleteNote(noteId) { NoteManager.deleteNote(noteId); }
function saveFocusedNoteJS() { NoteManager.saveFocusedNote(); }

// Export for global use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NoteManager;
} else {
    window.NoteManager = NoteManager;
}
