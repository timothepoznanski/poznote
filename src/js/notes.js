// Note management (creation, editing, saving)

// Utility functions for DOM element access
function getNoteElements(noteId) {
    return {
        entry: document.getElementById("entry" + noteId),
        title: document.getElementById("inp" + noteId),
        tags: document.getElementById("tags" + noteId),
        folder: document.getElementById("folder" + noteId),
        lastUpdated: document.getElementById("lastupdated" + noteId)
    };
}

function createNewNote() {
    var noteData = {
        folder_id: selectedFolderId || null,
        workspace: selectedWorkspace || getSelectedWorkspace(),
        type: 'note'
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
            showNotificationPopup(data.error || 'Error creating note', 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error: ' + error.message, 'error');
    });
}

function createTaskListNote() {
    var noteData = {
        folder_id: selectedFolderId || null,
        workspace: selectedWorkspace || getSelectedWorkspace(),
        type: 'tasklist'
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
            showNotificationPopup(data.error || 'Error creating tasklist', 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error: ' + error.message, 'error');
    });
}

function createMarkdownNote() {
    var noteData = {
        folder_id: selectedFolderId || null,
        workspace: selectedWorkspace || getSelectedWorkspace(),
        type: 'markdown'
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
            showNotificationPopup(data.error || 'Error creating markdown note', 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error: ' + error.message, 'error');
    });
}

function saveNote() {
    // Auto-save handles everything automatically now
}

function saveNoteToServer() {
    // Check that noteid is valid
    if (!noteid || noteid == -1 || noteid == '' || noteid === null || noteid === undefined) {
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
    
    // Prepare data
    var headi = titleInput.value || '';
    
    // If title is empty, only use placeholder if it matches default note title patterns
    // Support both English and French (and potentially other languages)
    if (headi === '' && titleInput.placeholder) {
        var placeholderPatterns = [
            /^New note( \(\d+\))?$/,        // English: "New note" or "New note (2)"
            /^Nouvelle note( \(\d+\))?$/    // French: "Nouvelle note" or "Nouvelle note (2)"
        ];
        
        var isDefaultPlaceholder = placeholderPatterns.some(function(pattern) {
            return pattern.test(titleInput.placeholder);
        });
        
        if (isDefaultPlaceholder) {
            headi = titleInput.placeholder;
        }
    }
    
    // If still empty, don't save to avoid "heading is required" error
    if (headi === '' || headi.trim() === '') {
        console.log('[Poznote Auto-Save] Skipping save: note has no title');
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
            handleSaveResponse(JSON.stringify({date: new Date().toLocaleDateString(), title: headi, original_title: headi}));
            
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

function handleSaveResponse(data) {
    try {
        var jsonData = JSON.parse(data);
        if (jsonData.status === 'error') {
            console.error('[Poznote Auto-Save] Save error:', jsonData.message);
            return;
        } else if (jsonData.date && jsonData.title) {
            // Title modified to ensure uniqueness
            updateLastSavedTime(jsonData.date);
            
            var elements = getNoteElements(noteid);
            if (elements.title && jsonData.title !== jsonData.original_title) {
                elements.title.value = jsonData.title;
            }
            
            updateNoteTitleInLeftColumn();
            
            // Update last saved content for change detection with the content that was just saved
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
            updateConnectionStatus(true);
            
            // Remove unsaved changes indicator from page title
            if (document.title.startsWith('🔴')) {
                document.title = document.title.substring(2); // Remove "🔴 " (emoji + space = 2 chars)
            }
            
            // Mark note as saved (remove from pending refresh list)
            if (typeof notesNeedingRefresh !== 'undefined') {
                notesNeedingRefresh.delete(String(noteid));
            }
            
            // Clear draft from localStorage after successful save
            if (typeof window.clearDraft === 'function') {
                window.clearDraft(noteid);
            }
            
            // Refresh tags count in sidebar after successful save
            if (typeof window.refreshTagsCount === 'function') {
                window.refreshTagsCount();
            }
            
            return;
        }
    } catch(e) {
        // Normal response (not JSON)
        if(data == '1') {
            updateLastSavedTime('Saved today');
        } else {
            updateLastSavedTime(data);
        }
        updateNoteTitleInLeftColumn();
        
        // Update last saved content for change detection with the content that was just saved
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
        updateConnectionStatus(true);
        
        // Remove unsaved changes indicator from page title
        if (document.title.startsWith('🔴')) {
            document.title = document.title.substring(2); // Remove "🔴 " (emoji + space = 2 chars)
        }
        
        // Clear draft from localStorage after successful save
        if (typeof window.clearDraft === 'function') {
            window.clearDraft(noteid);
        }
        
        // Mark note as saved (remove from pending refresh list)
        if (typeof notesNeedingRefresh !== 'undefined') {
            notesNeedingRefresh.delete(String(noteid));
        }
    }
}

function deleteNote(noteId) {
    // Check if the selected link in the list is a linked note
    // (since linked notes redirect to their target, we need to check the list item)
    const selectedLinks = document.querySelectorAll('.links_arbo_left.selected-note');
    let isLinkedNote = false;
    let linkedNoteDbId = null;
    
    for (let link of selectedLinks) {
        const linkType = link.getAttribute('data-note-type');
        if (linkType === 'linked') {
            isLinkedNote = true;
            linkedNoteDbId = link.getAttribute('data-note-db-id');
            break;
        }
    }
    
    // If we clicked on a linked note, show the special modal
    if (isLinkedNote && linkedNoteDbId) {
        showDeleteLinkedNoteModal(linkedNoteDbId);
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
            showDeleteLinkedNoteModal(noteId);
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

function redirectToWorkspace() {
    var wsRedirect = 'index.php?workspace=' + encodeURIComponent(selectedWorkspace || getSelectedWorkspace());
    // Ensure we don't scroll to note after delete on mobile
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('shouldScrollToNote');
    }
    window.location.href = wsRedirect;
}

// Utility functions for note content
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

function updateLastSavedTime(timeText) {
    var elements = getNoteElements(noteid);
    if (elements.lastUpdated) {
        elements.lastUpdated.innerHTML = timeText;
    }
}

function updateNoteTitleInLeftColumn() {
    if(noteid == 'search' || noteid == -1 || noteid === null || noteid === undefined) return;
    
    var elements = getNoteElements(noteid);
    if (!elements.title) return;
    
    var newTitle = elements.title.value.trim();
    
    // If title is empty, only use placeholder if it matches default note title patterns
    // Support both English and French (and potentially other languages)
    if (newTitle === '' && elements.title.placeholder) {
        var placeholderPatterns = [
            /^New note( \(\d+\))?$/,        // English: "New note" or "New note (2)"
            /^Nouvelle note( \(\d+\))?$/    // French: "Nouvelle note" or "Nouvelle note (2)"
        ];
        
        var isDefaultPlaceholder = placeholderPatterns.some(function(pattern) {
            return pattern.test(elements.title.placeholder);
        });
        
        if (isDefaultPlaceholder) {
            newTitle = elements.title.placeholder;
        }
    }
    
    // Si le titre est toujours vide après avoir vérifié le placeholder
    if (newTitle === '') {
        newTitle = 'Note sans titre';
    }
    
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
    
    // Update all found elements found
    for (var i = 0; i < elementsToUpdate.length; i++) {
        updateTitleInElement(elementsToUpdate[i], newTitle);
    }
}

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

// Open note in new tab
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

// Show delete linked note modal
function showDeleteLinkedNoteModal(linkedNoteId) {
    const modal = document.getElementById('deleteLinkedNoteModal');
    if (!modal) return;
    
    // Store the note ID for later use
    modal.dataset.linkedNoteId = linkedNoteId;
    
    // Try to get the linked note target ID from the selected link in the list
    const selectedLinks = document.querySelectorAll('.links_arbo_left.selected-note[data-note-type="linked"]');
    let linkedNoteTargetId = null;
    
    for (let link of selectedLinks) {
        const linkDbId = link.getAttribute('data-note-db-id');
        if (linkDbId === String(linkedNoteId)) {
            linkedNoteTargetId = link.getAttribute('data-linked-note-id');
            if (linkedNoteTargetId) {
                break;
            }
        }
    }
    
    // Fallback: try to get from the note card in DOM (for backward compatibility)
    if (!linkedNoteTargetId) {
        const noteCard = document.getElementById('note' + linkedNoteId);
        if (noteCard) {
            const noteEntry = noteCard.querySelector('.noteentry');
            linkedNoteTargetId = noteEntry ? noteEntry.getAttribute('data-linked-note-id') : null;
        }
    }
    
    // Store the target ID if found
    if (linkedNoteTargetId) {
        modal.dataset.linkedNoteTargetId = linkedNoteTargetId;
    } else {
        // If we don't have the target ID, remove it from dataset
        delete modal.dataset.linkedNoteTargetId;
    }
    
    modal.style.display = 'flex';
}

// Delete only the linked note (not the target)
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

// Delete the target note and all its links (the backend handles deleting all linked notes)
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

// Expose functions globally
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
            if (linkedNoteId && linkedNoteTargetId) {
                deleteLinkedNoteAndTarget(linkedNoteId, linkedNoteTargetId);
            }
        });
    }
});
