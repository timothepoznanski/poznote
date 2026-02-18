// ============================================================
// NOTE MANAGEMENT - Creation, Editing, Saving, Deletion
// ============================================================

// Constants
var DEFAULT_NOTE_TITLE_PATTERNS = [
    /^New note( \(\d+\))?$/,        // English: "New note" or "New note (2)"
    /^Nouvelle note( \(\d+\))?$/    // French: "Nouvelle note" or "Nouvelle note (2)"
];

// ============================================================
// DOM UTILITIES
// ============================================================

/**
 * Get all DOM elements for a specific note
 * @param {string|number} noteId - The note ID
 * @returns {Object} Object containing references to note elements
 */
function getNoteElements(noteId) {
    return {
        entry: document.getElementById("entry" + noteId),
        title: document.getElementById("inp" + noteId),
        tags: document.getElementById("tags" + noteId),
        folder: document.getElementById("folder" + noteId),
        lastUpdated: document.getElementById("lastupdated" + noteId)
    };
}

// ============================================================
// NOTE CREATION
// ============================================================

/**
 * Generic function to create a new note of any type
 * @param {string} noteType - Type of note: 'note', 'tasklist', or 'markdown'
 * @private
 */
function _createNoteOfType(noteType) {
    var noteData = {
        folder_id: selectedFolderId || null,
        workspace: selectedWorkspace || getSelectedWorkspace(),
        type: noteType
    };
    
    // Use RESTful API: POST /api/v1/notes
    fetch("/api/v1/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(noteData)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if(data.success && data.note) {
            window.scrollTo(0, 0);
            var ws = encodeURIComponent(selectedWorkspace || getSelectedWorkspace());
            window.location.href = "index.php?workspace=" + ws + "&note=" + data.note.id + "&scroll=1";
        } else {
            showNotificationPopup(data.error || 'Error creating ' + noteType, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error: ' + error.message, 'error');
    });
}

/**
 * Create a new standard HTML note
 */
function createNewNote() {
    _createNoteOfType('note');
}

/**
 * Create a new task list note
 */
function createTaskListNote() {
    _createNoteOfType('tasklist');
}

/**
 * Create a new markdown note
 */
function createMarkdownNote() {
    _createNoteOfType('markdown');
}

// ============================================================
// NOTE SAVING
// ============================================================

/**
 * Check if a placeholder matches default note title patterns
 * @param {string} placeholder - The placeholder text to check
 * @returns {boolean} True if placeholder is a default title pattern
 * @private
 */
function _isDefaultPlaceholder(placeholder) {
    if (!placeholder) return false;
    return DEFAULT_NOTE_TITLE_PATTERNS.some(function(pattern) {
        return pattern.test(placeholder);
    });
}

/**
 * Get the title for a note, using placeholder if empty and appropriate
 * @param {HTMLElement} titleInput - The title input element
 * @param {string} defaultTitle - Default title to use if empty (optional)
 * @returns {string} The note title
 * @private
 */
function _getNoteTitle(titleInput, defaultTitle) {
    if (!titleInput) return defaultTitle || '';
    
    var title = titleInput.value || '';
    
    // If title is empty, check if placeholder should be used
    if (title === '' && _isDefaultPlaceholder(titleInput.placeholder)) {
        title = titleInput.placeholder;
    }
    
    // If still empty, use default
    if (title === '' && defaultTitle) {
        title = defaultTitle;
    }
    
    return title;
}

/**
 * Save the current note to server
 * This function is called by the auto-save mechanism
 */
function saveNoteToServer() {
    // Check that noteid is valid
    if (!noteid || noteid === -1 || noteid === '' || noteid === null || noteid === undefined) {
        console.error('saveNoteToServer: invalid noteid', noteid);
        return;
    }

    // Get note elements of the note
    var elements = getNoteElements(noteid);
    var titleInput = elements.title;
    var entryElem = elements.entry;
    var tagsElem = elements.tags;
    var folderElem = elements.folder;

    // Check that elements exist
    if (!titleInput || !entryElem) {
        return;
    }
    
    // Get title (using placeholder if appropriate)
    var headi = _getNoteTitle(titleInput);
    
    // If title is empty, don't save to avoid "heading is required" error
    if (headi === '' || headi.trim() === '') {
        return;
    }
    
    // Serialize checklist data before saving
    serializeChecklists(entryElem);
    
    var ent = cleanSearchHighlightsFromElement(entryElem);
    ent = ent.replace(/<br\s*[\/]?>/gi, "&nbsp;<br>");
    
    var entcontent = getTextContentFromElement(entryElem);
    
    // Check if this is a task list note or markdown note
    var noteType = entryElem.getAttribute('data-note-type') || 'note';
    if (noteType === 'tasklist') {
        // For task list notes, save the JSON data instead of HTML
        entcontent = getTaskListData(noteid) || '';
        ent = entcontent; // Also save JSON to HTML file for consistency
    } else if (noteType === 'markdown') {
        // For markdown notes, save the raw markdown content
        if (typeof getMarkdownContentForNote === 'function') {
            var markdownContent = getMarkdownContentForNote(noteid);
            if (markdownContent !== null) {
                ent = markdownContent;
                entcontent = markdownContent;
            }
        }
    } else if (noteType === 'excalidraw') {
        // For Excalidraw notes in the new unified system, treat as regular HTML
        // The HTML already contains the image and hidden data, so save as-is
        // This allows text to be added around the Excalidraw diagram
    }
    
    var tags = tagsElem ? tagsElem.value : '';
    var folderIdElem = document.getElementById('folderId' + noteid);
    var folderId = null;
    if (folderIdElem && folderIdElem.value !== '') {
        folderId = parseInt(folderIdElem.value);
        // Ensure it's a valid number, not NaN or 0
        if (isNaN(folderId) || folderId === 0) {
            folderId = null;
        }
    }

    var updates = {
        heading: headi,
        content: ent,
        tags: tags,
        folder_id: folderId,
        workspace: selectedWorkspace || getSelectedWorkspace()
        // git_push is intentionally omitted here: the push is triggered only
        // when leaving the note (note switch or page unload), via emergencySave.
    };

    // Use RESTful API: PATCH /api/v1/notes/{id}
    fetch("/api/v1/notes/" + noteid, {
        method: "PATCH",
        headers: { 
            "Content-Type": "application/json",
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(updates)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            var responseTitle = (data.note && data.note.heading) ? data.note.heading : headi;
            handleSaveResponse(JSON.stringify({date: new Date().toLocaleDateString(), title: responseTitle, original_title: headi}));
            
            // Update linked notes in the list if any were updated
            if (data.note && data.updated_linked_notes && data.updated_linked_notes.length > 0) {
                var newTitle = data.note.heading;
                data.updated_linked_notes.forEach(function(linkedNoteId) {
                    var linkElements = document.querySelectorAll('.links_arbo_left[data-note-db-id="' + linkedNoteId + '"]');
                    linkElements.forEach(function(linkElement) {
                        updateTitleInElement(linkElement, newTitle);
                    });
                });
            }
            
            // Refresh tags count in sidebar after successful save
            if (typeof window.refreshTagsCount === 'function') {
                window.refreshTagsCount();
            }
            
            // Refresh Kanban view if active
            if (typeof window.refreshKanbanView === 'function') {
                window.refreshKanbanView();
            }
        } else {
            // Show user-visible error notification
            if (typeof showNotificationPopup === 'function') {
                showNotificationPopup(data.error || data.message || 'Error saving note', 'error');
            }
        }
    })
    .catch(function(error) {
        console.error('[Poznote Auto-Save] Network error:', error.message);
        if (typeof showNotificationPopup === 'function') {
            showNotificationPopup('Network error: ' + error.message, 'error');
        }
    });
}

/**
 * Handle the response from a save operation
 * @param {string} data - Response data (JSON string or plain text)
 */
function handleSaveResponse(data) {
    var timeText = 'Saved today';
    var titleChanged = false;
    
    // Get current title before processing response
    var elements = getNoteElements(noteid);
    var currentTitle = elements.title ? elements.title.value : '';
    
    // Check if title changed from last saved version
    if (typeof lastSavedTitle !== 'undefined' && currentTitle !== lastSavedTitle) {
        titleChanged = true;
    }
    
    try {
        var jsonData = JSON.parse(data);
        
        // Handle error response
        if (jsonData.status === 'error') {
            console.error('[Poznote Auto-Save] Save error:', jsonData.message);
            return;
        }
        
        // Handle success response with metadata
        if (jsonData.date && jsonData.title) {
            timeText = jsonData.date;
            
            // Check if server modified the title for uniqueness
            if (elements.title && jsonData.title !== jsonData.original_title) {
                elements.title.value = jsonData.title;
                titleChanged = true;
            }
        }
    } catch(e) {
        // Normal response (not JSON)
        timeText = (data === '1') ? 'Saved today' : data;
    }
    
    // Update UI after successful save
    _updateUIAfterSave(timeText, titleChanged);
}

/**
 * Update UI elements after a successful save
 * @param {string} timeText - Time text to display
 * @param {boolean} titleChanged - Whether the title was changed
 * @private
 */
function _updateUIAfterSave(timeText, titleChanged) {
    updateLastSavedTime(timeText);
    
    if (titleChanged) {
        updateNoteTitleInLeftColumn();
    }
    
    // Update last saved content for change detection FIRST (before hiding indicator)
    // to prevent race conditions where an event might re-trigger the indicator
    var elements = getNoteElements(noteid);
    if (elements.entry) {
        lastSavedContent = elements.entry.innerHTML;
    }
    if (elements.title) {
        lastSavedTitle = elements.title.value;
    }
    if (elements.tags) {
        lastSavedTags = elements.tags.value;
    }
    
    // Clear draft from localStorage
    if (typeof window.clearDraft === 'function') {
        window.clearDraft(noteid);
    }
    
    // Mark note as saved (remove from pending refresh list)
    if (typeof notesNeedingRefresh !== 'undefined') {
        notesNeedingRefresh.delete(String(noteid));
    }
    
    updateConnectionStatus(true);
    
    // NOW hide save indicator after all state is updated
    var saveIndicator = document.getElementById('save-indicator');
    if (saveIndicator) {
        saveIndicator.style.display = 'none';
    }
    
    // Remove red dot from page title
    if (document.title.startsWith('🔴 ')) {
        document.title = document.title.substring(3);
    } else if (document.title.startsWith('🔴')) {
        document.title = document.title.substring(2);
    }
    
    // Refresh tags count in sidebar after successful save
    if (typeof window.refreshTagsCount === 'function') {
        window.refreshTagsCount();
    }
}

// ============================================================
// NOTE DELETION
// ============================================================

/**
 * Delete a note (move to trash)
 * Handles both regular notes and linked notes
 * @param {string|number} noteId - The note ID to delete
 */
function deleteNote(noteId) {
    // Check if the selected link in the list is a linked note
    // (since linked notes redirect to their target, we need to check the list item)
    const selectedLinks = document.querySelectorAll('.links_arbo_left.selected-note');
    let isLinkedNote = false;
    let linkedNoteDbId = null;
    let linkedNoteTargetId = null;
    
    for (let link of selectedLinks) {
        const linkType = link.getAttribute('data-note-type');
        if (linkType === 'linked') {
            isLinkedNote = true;
            linkedNoteDbId = link.getAttribute('data-note-db-id');
            linkedNoteTargetId = link.getAttribute('data-linked-note-id');
            break;
        }
    }
    
    // If we clicked on a linked note, show the special modal
    if (isLinkedNote && linkedNoteDbId) {
        showDeleteLinkedNoteModal(linkedNoteDbId, linkedNoteTargetId);
        return;
    }
    
    // Also check if this is a linked note in the DOM (fallback for other cases)
    const noteCard = document.getElementById('note' + noteId);
    if (noteCard) {
        const noteEntry = noteCard.querySelector('.noteentry');
        const noteType = noteEntry ? noteEntry.getAttribute('data-note-type') : null;
        const linkedNoteId = noteEntry ? noteEntry.getAttribute('data-linked-note-id') : null;
        
        // If this is a linked note (either by type or by having a linked_note_id), show the modal
        if (noteType === 'linked' || linkedNoteId) {
            // Show special modal for linked notes
            showDeleteLinkedNoteModal(noteId, linkedNoteId);
            return;
        }
    }
    
    const workspace = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? pageWorkspace : null;
    
    // Build query params for RESTful API
    let url = "/api/v1/notes/" + noteId + "?permanent=false";
    if (workspace) {
        url += "&workspace=" + encodeURIComponent(workspace);
    }
    
    // Use RESTful API: DELETE /api/v1/notes/{id}
    fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data && data.success) {
            redirectToWorkspace();
            return;
        }
        
        if (data && (data.error || data.message)) {
            showNotificationPopup('Deletion error: ' + (data.error || data.message), 'error');
        } else {
            showNotificationPopup('Deletion error: Unknown error', 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error while deleting: ' + error.message, 'error');
    });
}

/**
 * Redirect to the current workspace after note deletion
 * @private
 */
function redirectToWorkspace() {
    var wsRedirect = 'index.php?workspace=' + encodeURIComponent(selectedWorkspace || getSelectedWorkspace());
    // Ensure we don't scroll to note after delete on mobile
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('shouldScrollToNote');
    }
    window.location.href = wsRedirect;
}

// ============================================================
// CONTENT UTILITIES
// ============================================================

/**
 * Remove search highlights from an element and return clean HTML
 * @param {HTMLElement} element - The element to clean
 * @returns {string} Clean HTML without search highlights
 */
function cleanSearchHighlightsFromElement(element) {
    if (!element) return "";
    
    var clonedElement = element.cloneNode(true);
    var highlights = clonedElement.querySelectorAll('.search-highlight');
    
    for (var i = 0; i < highlights.length; i++) {
        var highlight = highlights[i];
        var parent = highlight.parentNode;
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
    }
    
    return clonedElement.innerHTML;
}

/**
 * Get text content from an element without search highlights
 * @param {HTMLElement} element - The element to extract text from
 * @returns {string} Plain text content
 */
function getTextContentFromElement(element) {
    if (!element) return "";
    
    var clonedElement = element.cloneNode(true);
    var highlights = clonedElement.querySelectorAll('.search-highlight');
    
    for (var i = 0; i < highlights.length; i++) {
        var highlight = highlights[i];
        var parent = highlight.parentNode;
        parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
        parent.normalize();
    }
    
    return clonedElement.textContent || "";
}

// ============================================================
// UI UPDATE FUNCTIONS
// ============================================================

/**
 * Update the last saved time display
 * @param {string} timeText - Time text to display
 */
function updateLastSavedTime(timeText) {
    var elements = getNoteElements(noteid);
    if (elements.lastUpdated) {
        elements.lastUpdated.textContent = timeText;
    }
}

/**
 * Update the note title in the left sidebar/column
 * Updates all instances of the current note in the UI
 */
function updateNoteTitleInLeftColumn() {
    if(noteid === 'search' || noteid === -1 || noteid === null || noteid === undefined) return;
    
    var elements = getNoteElements(noteid);
    if (!elements.title) return;
    
    // Get title using helper function (handles placeholder logic)
    var newTitle = _getNoteTitle(elements.title, 'Note sans titre').trim();
    
    // Search elements to update
    var elementsToUpdate = [];
    
    // Method 1: by data-note-db-id
    var noteLinksById = document.querySelectorAll('.links_arbo_left[data-note-db-id="' + noteid + '"]');
    for (var i = 0; i < noteLinksById.length; i++) {
        elementsToUpdate.push(noteLinksById[i]);
    }
    
    // Method 2: selected notes (all instances of the same note)
    if (elementsToUpdate.length === 0) {
        var selectedNotes = document.querySelectorAll('.links_arbo_left.selected-note');
        for (var i = 0; i < selectedNotes.length; i++) {
            elementsToUpdate.push(selectedNotes[i]);
        }
    }
    
    // Update all found elements
    for (var i = 0; i < elementsToUpdate.length; i++) {
        updateTitleInElement(elementsToUpdate[i], newTitle);
    }
}

/**
 * Update the title in a specific link element
 * @param {HTMLElement} linkElement - The link element to update
 * @param {string} newTitle - The new title text
 */
function updateTitleInElement(linkElement, newTitle) {
    var titleSpan = linkElement.querySelector('.note-title');
    if (titleSpan) {
        // Check if there's an icon (for linked notes) and preserve it
        var icon = titleSpan.querySelector('.note-type-icon-inline');
        if (icon) {
            // Clear content but keep the icon
            titleSpan.textContent = '';
            titleSpan.appendChild(icon.cloneNode(true));
            titleSpan.appendChild(document.createTextNode(' ' + newTitle));
        } else {
            titleSpan.textContent = newTitle;
        }
        
        var href = linkElement.getAttribute('href');
        if (href) {
            var url = new URL(href, window.location.origin);
            url.searchParams.set('note', newTitle);
            linkElement.setAttribute('href', url.toString());
        }
        
        linkElement.setAttribute('data-note-id', newTitle);
    }
}

// ============================================================
// NOTE NAVIGATION
// ============================================================

/**
 * Open a note in a new browser tab
 * @param {string|number} noteId - The note ID to open
 */
function openNoteInNewTab(noteId) {
    if (!noteId) {
        console.error('No note ID provided');
        return;
    }
    
    // Build URL with note ID and current workspace
    var workspace = selectedWorkspace || getSelectedWorkspace();
    var url = 'index.php?workspace=' + encodeURIComponent(workspace) + '&note=' + encodeURIComponent(noteId);
    
    // Open in new tab
    window.open(url, '_blank');
}

// ============================================================
// LINKED NOTES MANAGEMENT
// ============================================================

/**
 * Fetch the linked note target ID from the API
 * @param {string|number} linkedNoteId - The linked note ID
 * @param {HTMLElement} modal - The modal element
 * @param {HTMLElement} deleteTargetBtn - The delete target button
 */
function fetchLinkedNoteTarget(linkedNoteId, modal, deleteTargetBtn) {
    const workspace = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? pageWorkspace : null;
    
    let url = '/api/v1/notes/' + linkedNoteId;
    if (workspace) {
        url += '?workspace=' + encodeURIComponent(workspace);
    }
    
    fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data && data.note && data.note.linked_note_id) {
            modal.dataset.linkedNoteTargetId = data.note.linked_note_id;
            if (deleteTargetBtn) {
                deleteTargetBtn.disabled = false;
                deleteTargetBtn.style.opacity = '1';
            }
        } else {
            // No target ID found - disable the button
            delete modal.dataset.linkedNoteTargetId;
            if (deleteTargetBtn) {
                deleteTargetBtn.disabled = true;
                deleteTargetBtn.style.opacity = '0.5';
            }
            console.error('Note does not have a linked_note_id:', data);
        }
        modal.style.display = 'flex';
    })
    .catch(function(error) {
        console.error('Error fetching linked note data:', error);
        // Disable the button on error
        delete modal.dataset.linkedNoteTargetId;
        if (deleteTargetBtn) {
            deleteTargetBtn.disabled = true;
            deleteTargetBtn.style.opacity = '0.5';
        }
        modal.style.display = 'flex';
    });
}

/**
 * Show modal for deleting a linked note
 * Allows choosing between deleting only the link or the target note too
 * @param {string|number} linkedNoteId - The linked note ID
 * @param {string|number|null} targetId - The target note ID (optional, will be fetched if not provided)
 */
function showDeleteLinkedNoteModal(linkedNoteId, targetId) {
    const modal = document.getElementById('deleteLinkedNoteModal');
    if (!modal) return;
    
    // Store the note ID for later use
    modal.dataset.linkedNoteId = linkedNoteId;
    
    let linkedNoteTargetId = targetId || null;
    
    // If not provided, try to find it in the DOM
    if (!linkedNoteTargetId) {
        // Method 1: Try to get from the link in the sidebar by data-note-db-id
        const linkByDbId = document.querySelector('.links_arbo_left[data-note-db-id="' + linkedNoteId + '"]');
        if (linkByDbId) {
            linkedNoteTargetId = linkByDbId.getAttribute('data-linked-note-id');
        }
        
        // Method 2: Try to get from the link in the sidebar by data-note-id
        if (!linkedNoteTargetId) {
            const linkByNoteId = document.querySelector('.links_arbo_left[data-note-id="' + linkedNoteId + '"]');
            if (linkByNoteId) {
                linkedNoteTargetId = linkByNoteId.getAttribute('data-linked-note-id');
            }
        }
        
        // Method 3: Try to get from the currently loaded note entry
        if (!linkedNoteTargetId) {
            const noteEntry = document.getElementById('entry' + linkedNoteId);
            if (noteEntry) {
                linkedNoteTargetId = noteEntry.getAttribute('data-linked-note-id');
            }
        }
        
        // Method 4: Try to get from the note card in DOM (for backward compatibility)
        if (!linkedNoteTargetId) {
            const noteCard = document.getElementById('note' + linkedNoteId);
            if (noteCard) {
                const noteEntry = noteCard.querySelector('.noteentry');
                linkedNoteTargetId = noteEntry ? noteEntry.getAttribute('data-linked-note-id') : null;
            }
        }
    }
    
    // Store the target ID if found
    const deleteTargetBtn = document.getElementById('deleteLinkedNoteAndTargetBtn');
    if (linkedNoteTargetId) {
        modal.dataset.linkedNoteTargetId = linkedNoteTargetId;
        if (deleteTargetBtn) {
            deleteTargetBtn.disabled = false;
            deleteTargetBtn.style.opacity = '1';
        }
        modal.style.display = 'flex';
    } else {
        // If we still don't have the target ID, fetch it from the API
        console.warn('Could not find linked_note_id in DOM for note ID:', linkedNoteId, '- fetching from API');
        fetchLinkedNoteTarget(linkedNoteId, modal, deleteTargetBtn);
    }
}

/**
 * Delete only the linked note (bookmark), keeping the target note
 * @param {string|number} linkedNoteId - The linked note ID to delete
 */
function deleteLinkedNoteOnly(linkedNoteId) {
    const workspace = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? pageWorkspace : null;
    
    let url = "/api/v1/notes/" + linkedNoteId + "?permanent=false";
    if (workspace) {
        url += "&workspace=" + encodeURIComponent(workspace);
    }
    
    fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data && data.success) {
            closeModal('deleteLinkedNoteModal');
            redirectToWorkspace();
            return;
        }
        
        if (data && (data.error || data.message)) {
            showNotificationPopup('Deletion error: ' + (data.error || data.message), 'error');
        } else {
            showNotificationPopup('Deletion error: Unknown error', 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error while deleting: ' + error.message, 'error');
    });
}

/**
 * Delete the target note and all its links
 * The backend automatically deletes all linked notes that reference the target
 * @param {string|number} linkedNoteId - The linked note ID
 * @param {string|number} targetNoteId - The target note ID to delete
 */
function deleteLinkedNoteAndTarget(linkedNoteId, targetNoteId) {
    const workspace = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? pageWorkspace : null;
    
    // Delete the target note - this will automatically delete all linked notes that reference it
    let url = "/api/v1/notes/" + targetNoteId + "?permanent=false";
    if (workspace) {
        url += "&workspace=" + encodeURIComponent(workspace);
    }
    
    fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data && data.success) {
            closeModal('deleteLinkedNoteModal');
            redirectToWorkspace();
        } else {
            throw new Error(data.error || data.message || 'Unknown error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Deletion error: ' + error.message, 'error');
    });
}

// ============================================================
// GLOBAL EXPORTS & EVENT LISTENERS
// ============================================================

// Expose functions globally for use in other scripts
window.saveNoteToServer = saveNoteToServer;
window.deleteNote = deleteNote;
window.openNoteInNewTab = openNoteInNewTab;
window.showDeleteLinkedNoteModal = showDeleteLinkedNoteModal;
window.deleteLinkedNoteOnly = deleteLinkedNoteOnly;
window.deleteLinkedNoteAndTarget = deleteLinkedNoteAndTarget;

// Event listeners for delete linked note modal
document.addEventListener('DOMContentLoaded', function() {
    const deleteLinkedNoteOnlyBtn = document.getElementById('deleteLinkedNoteOnlyBtn');
    const deleteLinkedNoteAndTargetBtn = document.getElementById('deleteLinkedNoteAndTargetBtn');

    if (deleteLinkedNoteOnlyBtn) {
        deleteLinkedNoteOnlyBtn.addEventListener('click', function() {
            const modal = document.getElementById('deleteLinkedNoteModal');
            const linkedNoteId = modal.dataset.linkedNoteId;
            if (linkedNoteId) {
                deleteLinkedNoteOnly(linkedNoteId);
            }
        });
    }

    if (deleteLinkedNoteAndTargetBtn) {
        deleteLinkedNoteAndTargetBtn.addEventListener('click', function() {
            const modal = document.getElementById('deleteLinkedNoteModal');
            const linkedNoteId = modal.dataset.linkedNoteId;
            const linkedNoteTargetId = modal.dataset.linkedNoteTargetId;
            
            if (!linkedNoteId) {
                showNotificationPopup('Error: Linked note ID not found', 'error');
                return;
            }
            
            if (!linkedNoteTargetId) {
                showNotificationPopup('Error: Target note ID not found. Cannot delete target note.', 'error');
                return;
            }
            
            deleteLinkedNoteAndTarget(linkedNoteId, linkedNoteTargetId);
        });
    }
});
