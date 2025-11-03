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
    var params = new URLSearchParams({
        now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
        folder_id: selectedFolderId,
        workspace: selectedWorkspace || 'Poznote'
    });
    
    fetch("api_insert_new.php", {
        method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest' },
        body: params.toString()
    })
    .then(function(response) { return response.text(); })
    .then(function(data) {
        try {
            var res = JSON.parse(data);
            if(res.status === 1) {
                window.scrollTo(0, 0);
                var ws = encodeURIComponent(selectedWorkspace || 'Poznote');
                window.location.href = "index.php?workspace=" + ws + "&note=" + res.id + "&scroll=1";
            } else {
                showNotificationPopup(res.error || 'Error creating note', 'error');
            }
        } catch(e) {
            showNotificationPopup('Error creating note: ' + data, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error: ' + error.message, 'error');
    });
}

function createTaskListNote() {
    var params = new URLSearchParams({
        now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
        folder_id: selectedFolderId,
        workspace: selectedWorkspace || 'Poznote',
        type: 'tasklist'
    });
    
    fetch("api_insert_new.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest' },
        body: params.toString()
    })
    .then(function(response) { return response.text(); })
    .then(function(data) {
        try {
            var res = JSON.parse(data);
            if(res.status === 1) {
                window.scrollTo(0, 0);
                var ws = encodeURIComponent(selectedWorkspace || 'Poznote');
                window.location.href = "index.php?workspace=" + ws + "&note=" + res.id + "&scroll=1";
            } else {
                showNotificationPopup(res.error || 'Error creating tasklist', 'error');
            }
        } catch(e) {
            showNotificationPopup('Error creating tasklist: ' + data, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error: ' + error.message, 'error');
    });
}

function createMarkdownNote() {
    var params = new URLSearchParams({
        now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
        folder_id: selectedFolderId,
        workspace: selectedWorkspace || 'Poznote',
        type: 'markdown'
    });
    
    fetch("api_insert_new.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", 'X-Requested-With': 'XMLHttpRequest' },
        body: params.toString()
    })
    .then(function(response) { return response.text(); })
    .then(function(data) {
        try {
            var res = JSON.parse(data);
            if(res.status === 1) {
                window.scrollTo(0, 0);
                var ws = encodeURIComponent(selectedWorkspace || 'Poznote');
                window.location.href = "index.php?workspace=" + ws + "&note=" + res.id + "&scroll=1";
            } else {
                showNotificationPopup(res.error || 'Error creating markdown note', 'error');
            }
        } catch(e) {
            showNotificationPopup('Error creating markdown note: ' + data, 'error');
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

    var params = {
        id: noteid,
        heading: headi,
        entry: ent,
        tags: tags,
        folder_id: folderId,
        workspace: selectedWorkspace || 'Poznote'
    };
    
    fetch("api_update_note.php", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(params)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data.success) {
            handleSaveResponse(JSON.stringify({date: new Date().toLocaleDateString(), title: headi, original_title: headi}));
        } else {
            console.error('[Poznote Auto-Save] Save error:', data.message || 'Unknown error');
        }
    })
    .catch(function(error) {
        console.error('[Poznote Auto-Save] Network error:', error.message);
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
        
        // Mark note as saved (remove from pending refresh list)
        if (typeof notesNeedingRefresh !== 'undefined') {
            notesNeedingRefresh.delete(String(noteid));
        }
    }
}

function deleteNote(noteId) {
    const workspace = (typeof pageWorkspace !== 'undefined' && pageWorkspace) ? pageWorkspace : null;
    const requestBody = {
        note_id: noteId,
        permanent: false
    };
    
    if (workspace) {
        requestBody.workspace = workspace;
    }
    
    fetch("api_delete_note.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data && data.success) {
            redirectToWorkspace();
            return;
        }
        
        if (data && data.message) {
            showNotificationPopup('Deletion error: ' + data.message, 'error');
        } else {
            showNotificationPopup('Deletion error: Unknown error', 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Network error while deleting: ' + error.message, 'error');
    });
}

function redirectToWorkspace() {
    var wsRedirect = 'index.php?workspace=' + encodeURIComponent(selectedWorkspace || 'Poznote');
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
    if (newTitle === '') newTitle = 'Note sans titre';
    
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
        titleSpan.textContent = newTitle;
        
        var href = linkElement.getAttribute('href');
        if (href) {
            var url = new URL(href, window.location.origin);
            url.searchParams.set('note', newTitle);
            linkElement.setAttribute('href', url.toString());
        }
        
        linkElement.setAttribute('data-note-id', newTitle);
    }
}

// Expose functions globally
window.saveNoteToServer = saveNoteToServer;
window.deleteNote = deleteNote;
