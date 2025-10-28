// Note management (creation, editing, saving)

function createNewNote() {
    var params = new URLSearchParams({
        now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60,
        folder: selectedFolder,
        workspace: selectedWorkspace || 'Poznote'
    });
    
    fetch("insert_new.php", {
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
        folder: selectedFolder,
        workspace: selectedWorkspace || 'Poznote',
        type: 'tasklist'
    });
    
    fetch("insert_new.php", {
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
        folder: selectedFolder,
        workspace: selectedWorkspace || 'Poznote',
        type: 'markdown'
    });
    
    fetch("insert_new.php", {
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
    if(noteid == -1 || noteid === null || noteid === undefined || noteid == '') {
        return;
    }
    
    if(updateNoteEnCours == 1) {
        return;
    }
    
    if(editedButNotSaved == 1) {
        displaySavingInProgress();
        saveNoteToServer();
    }
    // Note: removed "No changes to save" popup per user request
}

function saveNoteToServer() {
    updateNoteEnCours = 1;

    // Check that noteid is valid
    if (!noteid || noteid == -1 || noteid == '' || noteid === null || noteid === undefined) {
        console.error('saveNoteToServer: invalid noteid', noteid);
        updateNoteEnCours = 0;
        return;
    }

    // Get note elements of the note
    var titleInput = document.getElementById("inp" + noteid);
    var entryElem = document.getElementById("entry" + noteid);
    var tagsElem = document.getElementById("tags" + noteid);
    var folderElem = document.getElementById("folder" + noteid);

    // Check that elements exist
    if (!titleInput || !entryElem) {
        console.error('saveNoteToServer: missing elements for noteid=', noteid);
        updateNoteEnCours = 0;
        // Don't set editedButNotSaved = 1 since the note elements no longer exist
        return;
    }
    
    // Prepare data
    var headi = titleInput.value || '';
    
    // IMPORTANT: Serialize checklist input values into the HTML before saving
    // This ensures checklist text AND checkbox state is preserved when the page is reloaded
    var checklists = entryElem.querySelectorAll('.checklist');
    checklists.forEach(function(checklist) {
        var items = checklist.querySelectorAll('.checklist-item');
        items.forEach(function(item) {
            var checkbox = item.querySelector('.checklist-checkbox');
            var input = item.querySelector('.checklist-input');
            if (checkbox && input) {
                // Store the current values in data attributes
                checkbox.setAttribute('data-checked', checkbox.checked ? '1' : '0');
                input.setAttribute('data-value', input.value);
                // Also store in input.value attribute so it gets serialized with innerHTML
                input.setAttribute('value', input.value);
            }
        });
    });
    
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
    var folder = folderElem ? folderElem.value : getDefaultFolderName();

    var params = new URLSearchParams({
        id: noteid,
        tags: tags,
        folder: folder,
        heading: headi,
        entry: ent,
        workspace: selectedWorkspace || 'Poznote',
        entrycontent: entcontent,
        now: (new Date().getTime()/1000) - new Date().getTimezoneOffset()*60
    });
    
    fetch("update_note.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(function(response) { return response.text(); })
    .then(function(data) {
        handleSaveResponse(data);
    })
    .catch(function(error) {
        showNotificationPopup('Network error while saving: ' + error.message, 'error');
        editedButNotSaved = 1;
        updateNoteEnCours = 0;
        setSaveButtonRed(true);
    });
}

function handleSaveResponse(data) {
    try {
        var jsonData = JSON.parse(data);
        if (jsonData.status === 'error') {
            showNotificationPopup('Save error: ' + jsonData.message, 'error');
            editedButNotSaved = 1;
            updateNoteEnCours = 0;
            setSaveButtonRed(true);
            return;
        } else if (jsonData.date && jsonData.title) {
            // Title modified to ensure uniqueness
            editedButNotSaved = 0;
            updateLastSavedTime(jsonData.date);
            
            var titleInput = document.getElementById('inp'+noteid);
            if (titleInput && jsonData.title !== jsonData.original_title) {
                titleInput.value = jsonData.title;
                showNotificationPopup('Title modified to ensure uniqueness: ' + jsonData.title);
            }
            
            updateNoteTitleInLeftColumn();
            updateNoteEnCours = 0;
            setSaveButtonRed(false);
            return;
        }
    } catch(e) {
        // Normal response (not JSON)
        if(data == '1') {
            editedButNotSaved = 0;
            updateLastSavedTime('Saved today');
        } else {
            editedButNotSaved = 0;
            updateLastSavedTime(data);
        }
        updateNoteTitleInLeftColumn();
        updateNoteEnCours = 0;
        setSaveButtonRed(false);
    }
}

function deleteNote(noteId) {
    var params = new URLSearchParams({ id: noteId });
    
    fetch("delete_note.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    })
    .then(function(response) { return response.text(); })
    .then(function(data) {
        var trimmed = (data || '').trim();
        
        if (trimmed === '1') {
            redirectToWorkspace();
            return;
        }
        
        try {
            var jsonData = JSON.parse(trimmed);
            if (jsonData === 1 || (jsonData && jsonData.status === 'ok')) {
                redirectToWorkspace();
                return;
            }
            if (jsonData && jsonData.status === 'error') {
                showNotificationPopup('Deletion error: ' + (jsonData.message || 'Unknown error'), 'error');
                return;
            }
            redirectToWorkspace();
        } catch(e) {
            showNotificationPopup('Deletion error: ' + trimmed, 'error');
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
    var lastUpdatedElem = document.getElementById('lastupdated' + noteid);
    if (lastUpdatedElem) {
        lastUpdatedElem.innerHTML = timeText;
    }
}

function updateNoteTitleInLeftColumn() {
    if(noteid == 'search' || noteid == -1 || noteid === null || noteid === undefined) return;
    
    var titleInput = document.getElementById('inp' + noteid);
    if (!titleInput) return;
    
    var newTitle = titleInput.value.trim();
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
