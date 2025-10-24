// Event and user interaction management

function initializeEventListeners() {
    // Events for note modification
    setupNoteEditingEvents();
    
    // Events for attached files
    setupAttachmentEvents();
    
    // Events for image drag & drop
    setupDragDropEvents();
    
    // Events for note drag & drop between folders
    setupNoteDragDropEvents();
    
    // Events for link management
    setupLinkEvents();
    
    // Focus events
    setupFocusEvents();
    
    // Automatic change checking
    setupAutoSaveCheck();
    
    // Warning before page close
    setupPageUnloadWarning();
    
    
}

function setupNoteEditingEvents() {
    var eventTypes = ['keyup', 'input', 'paste'];
    
    for (var i = 0; i < eventTypes.length; i++) {
        var eventType = eventTypes[i];
        document.body.addEventListener(eventType, function(e) {
            handleNoteEditEvent(e);
        });
    }
    
    // Special handling for tags with the space bar
    document.body.addEventListener('keydown', function(e) {
        handleTagsKeydown(e);
    });
    
    // Special handling for title blur and keydown events (Enter/Escape)
    document.body.addEventListener('blur', function(e) {
        handleTitleBlur(e);
    }, true); // Use capture phase to ensure we catch the event
    
    document.body.addEventListener('keydown', function(e) {
        handleTitleKeydown(e);
    });
}

function handleNoteEditEvent(e) {
    var target = e.target;
    
    if (target.classList.contains('name_doss')) {
        if (updateNoteEnCours == 1) {
            showNotificationPopup("Save in progress...");
        } else {
            updateNote();
        }
    } else if (target.classList.contains('noteentry')) {
        if (updateNoteEnCours == 1) {
            showNotificationPopup("Auto-save in progress, please do not modify the note.");
        } else {
            updateNote();
        }
    } else if (target.tagName === 'INPUT') {
        // Ignore search fields
        if (target.classList.contains('searchbar') ||
            target.id === 'search' ||
            target.classList.contains('searchtrash') ||
            target.id === 'myInputFiltrerTags') {
            return;
        }
        
        // Ignore title fields - they are handled separately on blur/Enter/Escape only
        if (target.classList.contains('css-title') ||
            (target.id && target.id.startsWith('inp'))) {
            return;
        }
        
        // Process other note fields (tags, etc.)
        if (target.id && target.id.startsWith('tags')) {
            if (updateNoteEnCours == 1) {
                showNotificationPopup("Save in progress...");
            } else {
                updateNote();
            }
        }
    }
}

function handleTagsKeydown(e) {
    var target = e.target;
    
    // Check if this is a standard tags field
    if (target.tagName === 'INPUT' && 
        target.id && 
        target.id.startsWith('tags') &&
        !target.classList.contains('tag-input')) {
        
        if (e.key === ' ') {
            var input = target;
            var currentValue = input.value;
            var cursorPos = input.selectionStart;
            
            var textBeforeCursor = currentValue.substring(0, cursorPos);
            var lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
            var currentTag = textBeforeCursor.substring(lastSpaceIndex + 1).trim();
            
            if (currentTag && currentTag.length > 0) {
                e.preventDefault();
                
                var charAfterCursor = currentValue.charAt(cursorPos);
                if (charAfterCursor !== ' ' && charAfterCursor !== '') {
                    input.value = currentValue.substring(0, cursorPos) + ' ' + currentValue.substring(cursorPos);
                    input.setSelectionRange(cursorPos + 1, cursorPos + 1);
                } else {
                    input.setSelectionRange(cursorPos + 1, cursorPos + 1);
                }
                
                updateNote();
            }
        }
    }
}

function handleTitleBlur(e) {
    var target = e.target;
    
    // Check if this is a title input field
    if (target.tagName === 'INPUT' && 
        (target.classList.contains('css-title') || 
         (target.id && target.id.startsWith('inp')))) {
        
        // Ignore if this is a search field
        if (target.classList.contains('searchbar') ||
            target.id === 'search' ||
            target.classList.contains('searchtrash') ||
            target.id === 'myInputFiltrerTags') {
            return;
        }
        
        // Save immediately when losing focus
        if (updateNoteEnCours == 1) {
            // If save is already in progress, we'll let it complete
            return;
        }
        
        // Set the note ID from the input ID
        updateidhead(target);
        saveNoteToServer();
    }
}

function handleTitleKeydown(e) {
    var target = e.target;
    
    // Check if this is a title input field
    if (target.tagName === 'INPUT' && 
        (target.classList.contains('css-title') || 
         (target.id && target.id.startsWith('inp')))) {
        
        // Ignore if this is a search field
        if (target.classList.contains('searchbar') ||
            target.id === 'search' ||
            target.classList.contains('searchtrash') ||
            target.id === 'myInputFiltrerTags') {
            return;
        }
        
        // Handle Enter and Escape keys
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            
            // Blur the input to trigger save
            target.blur();
            
            // Save immediately 
            if (updateNoteEnCours == 1) {
                // If save is already in progress, we'll let it complete
                return;
            }
            
            // Set the note ID from the input ID
            updateidhead(target);
            saveNoteToServer();
        }
    }
}

function setupAttachmentEvents() {
    document.addEventListener('DOMContentLoaded', function() {
        var fileInput = document.getElementById('attachmentFile');
        var fileNameDiv = document.getElementById('selectedFileName');
        var uploadButtonContainer = document.querySelector('.upload-button-container');
        
        if (fileInput && fileNameDiv) {
            fileInput.addEventListener('change', function() {
                if (fileInput.files && fileInput.files.length > 0) {
                    fileNameDiv.textContent = fileInput.files[0].name;
                    if (uploadButtonContainer) {
                        uploadButtonContainer.classList.add('show');
                    }
                } else {
                    fileNameDiv.textContent = '';
                    if (uploadButtonContainer) {
                        uploadButtonContainer.classList.remove('show');
                    }
                }
            });
        }
    });
}

function setupDragDropEvents() {
    document.body.addEventListener('dragenter', function(e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (potential) {
                e.preventDefault();
                // Ajouter une classe visuelle pour montrer que le drop est possible
                potential.classList.add('drag-over');
            }
        } catch (err) {}
    });

    document.body.addEventListener('dragover', function(e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (potential) {
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
            }
        } catch (err) {}
    });

    document.body.addEventListener('dragleave', function(e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var potential = el && el.closest ? el.closest('.noteentry') : null;
            if (!potential) {
                // Supprimer la classe visuelle
                document.querySelectorAll('.noteentry.drag-over').forEach(function(note) {
                    note.classList.remove('drag-over');
                });
            }
        } catch (err) {}
    });

    document.body.addEventListener('drop', function(e) {
        try {
            var el = document.elementFromPoint(e.clientX, e.clientY);
            var note = el && el.closest ? el.closest('.noteentry') : null;
            
            if (!note && e.target && e.target.closest) {
                note = e.target.closest('.noteentry');
            }
            
            if (!note) return;

            e.preventDefault();
            e.stopPropagation();

            // Supprimer la classe visuelle
            note.classList.remove('drag-over');

            var dt = e.dataTransfer;
            if (!dt) return;

            if (dt.files && dt.files.length > 0) {
                handleImageFilesAndInsert(dt.files, note);
            }
        } catch (err) {
            console.log('Error during drop:', err);
        }
    });
}

function setupNoteDragDropEvents() {
    // Remove existing event listeners to avoid duplicates
    document.querySelectorAll('.links_arbo_left.note-in-folder').forEach(function(link) {
        link.removeEventListener('dragstart', handleNoteDragStart);
        link.removeEventListener('dragend', handleNoteDragEnd);
    });
    
    document.querySelectorAll('.folder-header').forEach(function(header) {
        header.removeEventListener('dragover', handleFolderDragOver);
        header.removeEventListener('drop', handleFolderDrop);
        header.removeEventListener('dragleave', handleFolderDragLeave);
    });
    
    // Add drag events to note links
    var noteLinks = document.querySelectorAll('.links_arbo_left.note-in-folder');
    noteLinks.forEach(function(link) {
        link.draggable = true;
        link.addEventListener('dragstart', handleNoteDragStart);
        link.addEventListener('dragend', handleNoteDragEnd);
    });
    
    // Add drop events to folder headers
    var folderHeaders = document.querySelectorAll('.folder-header');
    folderHeaders.forEach(function(header) {
        header.addEventListener('dragover', handleFolderDragOver);
        header.addEventListener('drop', handleFolderDrop);
        header.addEventListener('dragleave', handleFolderDragLeave);
    });
}

function handleNoteDragStart(e) {
    var noteLink = e.target.closest('.links_arbo_left.note-in-folder');
    if (!noteLink) return;
    
    var noteId = noteLink.getAttribute('data-note-db-id');
    var currentFolder = noteLink.getAttribute('data-folder');
    
    if (noteId) {
        e.dataTransfer.setData('text/plain', JSON.stringify({
            noteId: noteId,
            currentFolder: currentFolder
        }));
        e.dataTransfer.effectAllowed = 'move';
        
        // Add visual feedback
        noteLink.classList.add('dragging');
    }
}

function handleNoteDragEnd(e) {
    // Remove dragging class
    var noteLink = e.target.closest('.links_arbo_left.note-in-folder');
    if (noteLink) {
        noteLink.classList.remove('dragging');
    }
    
    // Remove drag-over class from all folders
    document.querySelectorAll('.folder-header.drag-over').forEach(function(header) {
        header.classList.remove('drag-over');
    });
}

function handleFolderDragOver(e) {
    e.preventDefault();
    
    var folderHeader = e.target.closest('.folder-header');
    if (folderHeader) {
        var targetFolder = folderHeader.getAttribute('data-folder');
        
        // Prevent drag-over effect for Tags folder
        if (targetFolder === 'Tags') {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        
        // Allow drag-over for all other folders including Favorites
        e.dataTransfer.dropEffect = 'move';
        folderHeader.classList.add('drag-over');
    }
}

function handleFolderDragLeave(e) {
    var folderHeader = e.target.closest('.folder-header');
    if (folderHeader) {
        folderHeader.classList.remove('drag-over');
    }
}

function handleFolderDrop(e) {
    e.preventDefault();
    
    var folderHeader = e.target.closest('.folder-header');
    if (!folderHeader) return;
    
    folderHeader.classList.remove('drag-over');
    
    // Remove dragging class from all notes
    document.querySelectorAll('.links_arbo_left.dragging').forEach(function(link) {
        link.classList.remove('dragging');
    });
    
    try {
        var data = JSON.parse(e.dataTransfer.getData('text/plain'));
        var targetFolder = folderHeader.getAttribute('data-folder');
        
        // Prevent dropping notes into the Tags folder
        if (targetFolder === 'Tags') {
            return;
        }
        
        // Special handling for Favorites folder
        if (targetFolder === 'Favorites') {
            // Add note to favorites instead of moving it
            toggleFavorite(data.noteId);
            return;
        }
        
        // Special handling for Trash folder
        if (targetFolder === 'Trash') {
            // Delete note and move it to trash
            deleteNote(data.noteId);
            return;
        }
        
        if (data.noteId && targetFolder && data.currentFolder !== targetFolder) {
            moveNoteToTargetFolder(data.noteId, targetFolder);
        }
    } catch (err) {
        console.log('Error parsing drag data:', err);
    }
}

function moveNoteToTargetFolder(noteId, targetFolder) {
    var params = new URLSearchParams({
        action: 'move_to',
        note_id: noteId,
        folder: targetFolder,
        workspace: selectedWorkspace || 'Poznote'
    });
    
    fetch("folder_operations.php", {
        method: "POST",
        headers: { 
            "Content-Type": "application/x-www-form-urlencoded", 
            'X-Requested-With': 'XMLHttpRequest', 
            'Accept': 'application/json' 
        },
        body: params.toString()
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        if (data && data.success) {
            // Note moved successfully - no notification needed
            // Reload the page to reflect changes
            setTimeout(function() {
                location.reload();
            }, 500);
        } else {
            var err = (data && (data.error || data.message)) ? (data.error || data.message) : 'Unknown error';
            showNotificationPopup('Error moving note: ' + err, 'error');
        }
    })
    .catch(function(error) {
        showNotificationPopup('Error moving note: ' + error.message, 'error');
    });
}

function setupLinkEvents() {
    document.addEventListener('click', function(e) {
        // Make links clickable in contenteditable areas
        if (e.target.tagName === 'A' && e.target.closest('[contenteditable="true"]')) {
            e.preventDefault();
            e.stopPropagation();
            
            // Check if this is a note-to-note link
            var href = e.target.href;
            var noteMatch = href.match(/[?&]note=(\d+)/);
            var workspaceMatch = href.match(/[?&]workspace=([^&]+)/);
            
            if (noteMatch && noteMatch[1]) {
                // This is a note-to-note link - open it within the app
                var targetNoteId = noteMatch[1];
                var targetWorkspace = workspaceMatch ? decodeURIComponent(workspaceMatch[1]) : (selectedWorkspace || 'Poznote');
                
                // If workspace is different, reload page with new workspace and note
                if (targetWorkspace !== selectedWorkspace) {
                    // Update localStorage with the new workspace
                    try {
                        localStorage.setItem('poznote_selected_workspace', targetWorkspace);
                    } catch (e) {
                        console.log('Could not save workspace to localStorage:', e);
                    }
                    
                    // Navigate to the new workspace with the target note
                    var url = 'index.php?workspace=' + encodeURIComponent(targetWorkspace) + '&note=' + targetNoteId;
                    window.location.href = url;
                } else {
                    // Same workspace, just load the note
                    loadNoteById(targetNoteId);
                }
            } else {
                // Regular external link - open in new tab
                window.open(href, '_blank');
            }
        }
    });
    
    // Image and text paste management
    document.body.addEventListener('paste', function(e) {
        try {
            var note = (e.target && e.target.closest) ? e.target.closest('.noteentry') : null;
            if (!note) return;
            
            // Check if this is a markdown note
            var isMarkdownNote = note.getAttribute('data-note-type') === 'markdown';
            
            var items = (e.clipboardData && e.clipboardData.items) ? e.clipboardData.items : null;
            
            // Handle image paste
            if (items) {
                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    if (item && item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                        e.preventDefault();
                        var file = item.getAsFile();
                        if (file) {
                            handleImageFilesAndInsert([file], note);
                        }
                        return;
                    }
                }
            }
            
            // Handle text paste for HTML rich notes (not markdown)
            if (!isMarkdownNote && e.clipboardData) {
                var htmlData = e.clipboardData.getData('text/html');
                var plainText = e.clipboardData.getData('text/plain');
                
                // Detect if this is code from VSCode or another code editor
                // VSCode adds specific classes or the HTML contains code-like formatting
                var isCodeFromEditor = false;
                
                if (htmlData) {
                    // Check for VSCode specific markers or code editor patterns
                    isCodeFromEditor = htmlData.includes('class="vscode-') || 
                                       htmlData.includes('monaco-') ||
                                       htmlData.includes('mtk') || // VSCode token class
                                       (htmlData.includes('<span') && htmlData.includes('font-family') && plainText.split('\n').length > 1);
                }
                
                // Also check if the plain text looks like code (multiple lines with indentation)
                if (!isCodeFromEditor && plainText) {
                    var lines = plainText.split('\n');
                    var hasIndentation = lines.some(function(line) {
                        return line.match(/^[\t ]{2,}/);
                    });
                    // If multiple lines with indentation, likely code
                    if (lines.length > 2 && hasIndentation) {
                        isCodeFromEditor = true;
                    }
                }
                
                if (isCodeFromEditor && plainText) {
                    e.preventDefault();
                    
                    // Create a <pre> element with monospace font to preserve code formatting
                    var pre = document.createElement('pre');
                    pre.className = 'code-block';
                    pre.textContent = plainText;
                    
                    // Insert the <pre> at cursor position
                    var selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        var range = selection.getRangeAt(0);
                        range.deleteContents();
                        
                        // Insert the pre element
                        range.insertNode(pre);
                        
                        // Add a line break after for easier editing
                        var br = document.createElement('br');
                        range.setStartAfter(pre);
                        range.insertNode(br);
                        
                        // Move cursor after the inserted code
                        range.setStartAfter(br);
                        range.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                    
                    // Trigger update
                    if (typeof updateNote === 'function') {
                        updateNote();
                    }
                    return;
                }
                
                // Detect if this is a URL being pasted
                if (plainText && !htmlData) {
                    var trimmedText = plainText.trim();
                    // Check if the pasted text is a valid URL (http/https/ftp)
                    var urlRegex = /^(https?:\/\/|ftp:\/\/)[^\s]+$/i;
                    
                    if (urlRegex.test(trimmedText)) {
                        e.preventDefault();
                        
                        // Create a clickable link element
                        var link = document.createElement('a');
                        link.href = trimmedText;
                        link.textContent = trimmedText;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        
                        // Insert the link at cursor position
                        var selection = window.getSelection();
                        if (selection.rangeCount > 0) {
                            var range = selection.getRangeAt(0);
                            range.deleteContents();
                            
                            // Insert the link element
                            range.insertNode(link);
                            
                            // Add a space after for easier editing
                            var space = document.createTextNode(' ');
                            range.setStartAfter(link);
                            range.insertNode(space);
                            
                            // Move cursor after the inserted link
                            range.setStartAfter(space);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                        
                        // Trigger update
                        if (typeof updateNote === 'function') {
                            updateNote();
                        }
                    }
                }
            }
        } catch (err) {
            console.log('Error during paste:', err);
        }
    });
}

function setupFocusEvents() {
    document.body.addEventListener('focusin', function(e) {
        if (e.target.classList.contains('searchbar') || 
            e.target.id === 'search' || 
            e.target.classList.contains('searchtrash')) {
            noteid = -1;
        }
    });
}

function setupAutoSaveCheck() {
    setInterval(function() {
        checkAndAutoSave();
    }, 2000);
}

function setupPageUnloadWarning() {
    window.addEventListener('beforeunload', function (e) {
        if (editedButNotSaved === 1 &&
            updateNoteEnCours === 0 &&
            noteid !== -1 &&
            noteid !== 'search') {
            var confirmationMessage = 'Unsaved changes will be lost. Do you really want to leave this page?';
            e.returnValue = confirmationMessage;
            return confirmationMessage;
        }
    });
}

// Utility functions
function updateNote() {
    if (noteid == 'search' || noteid == -1 || noteid === null || noteid === undefined) return;
    
    editedButNotSaved = 1;
    var curdate = new Date();
    var curtime = curdate.getTime();
    lastudpdate = curtime;
    displayEditInProgress();
    setSaveButtonRed(true);
}

function checkAndAutoSave() {
    if (noteid == -1) return;
    
    var curdate = new Date();
    var curtime = curdate.getTime();
    
    // If modified for more than 15 seconds and no save in progress
    if (updateNoteEnCours == 0 && editedButNotSaved == 1 && curtime - lastudpdate > 15000) {
        displaySavingInProgress();
        saveNoteToServer();
    }
}

// Functions for element IDs
function updateidsearch(el) {
    noteid = el.id.substr(5);
}

function updateidhead(el) {
    noteid = el.id.substr(3); // 3 for 'inp'
}

function updateidtags(el) {
    noteid = el.id.substr(4);
}

function updateidfolder(el) {
    noteid = el.id.substr(6); // 6 for 'folder'
}

function updateident(el) {
    noteid = el.id.substr(5);
}

// Alias for compatibility
function newnote() {
    createNewNote();
}

function updatenote() {
    saveNoteToServer();
}

function saveFocusedNoteJS() {
    saveNote();
}

// Text selection management for formatting toolbar
function initTextSelectionHandlers() {
    // Check if we're in desktop mode
    var isMobile = isMobileDevice();
    
    var selectionTimeout;
    
    function handleSelectionChange() {
        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(function() {
            var selection = window.getSelection();
            
                // Desktop handling (existing code)
                var textFormatButtons = document.querySelectorAll('.text-format-btn');
                var noteActionButtons = document.querySelectorAll('.note-action-btn');
                
                // Check if the selection contains text
                if (selection && selection.toString().trim().length > 0) {
                    var range = selection.getRangeAt(0);
                    var container = range.commonAncestorContainer;
                    
                    // Improve detection of editable area
                    var currentElement = container.nodeType === 3 ? container.parentElement : container; // Node.TEXT_NODE
                    var editableElement = null;
                    
                    // Go up the DOM tree to find an editable area
                    var isTitleOrTagField = false;
                    while (currentElement && currentElement !== document.body) {
                        
                        // Check the current element and its direct children for title/tag fields
                        function checkElementAndChildren(element) {
                            // Check the element itself
                            if (element.classList && 
                                (element.classList.contains('css-title') || 
                                 element.classList.contains('add-margin') ||
                                 (element.id && (element.id.indexOf('inp') === 0 || element.id.indexOf('tags') === 0)))) {
                                return true;
                            }
                            
                            // Check direct children (for the case <h4><input class="css-title"...></h4>)
                            if (element.children) {
                                for (var i = 0; i < element.children.length; i++) {
                                    var child = element.children[i];
                                    if (child.classList && 
                                        (child.classList.contains('css-title') || 
                                         child.classList.contains('add-margin') ||
                                         (child.id && (child.id.indexOf('inp') === 0 || child.id.indexOf('tags') === 0)))) {
                                        return true;
                                    }
                                }
                            }
                            return false;
                        }
                        
                        if (checkElementAndChildren(currentElement)) {
                            isTitleOrTagField = true;
                            break;
                        }
                        // If selection is inside a markdown editor or preview, hide formatting toolbar
                        if (currentElement.classList && 
                            (currentElement.classList.contains('markdown-editor') || 
                             currentElement.classList.contains('markdown-preview'))) {
                            isTitleOrTagField = true;
                            break;
                        }
                        // If selection is inside a task list, treat it as non-editable for formatting
                        try {
                            if (currentElement && currentElement.closest && currentElement.closest('.task-list-container, .tasks-list, .task-item, .task-text')) {
                            // Consider as not editable so formatting buttons won't appear
                            editableElement = null;
                            isTitleOrTagField = true;
                            break;
                        }
                        } catch (err) {}
                        // Treat selection inside the note metadata subline as title-like (do not toggle toolbar)
                        if (currentElement.classList && currentElement.classList.contains('note-subline')) {
                            isTitleOrTagField = true;
                            break;
                        }
                        if (currentElement.classList && currentElement.classList.contains('noteentry')) {
                            editableElement = currentElement;
                            break;
                        }
                        if (currentElement.contentEditable === 'true') {
                            editableElement = currentElement;
                            break;
                        }
                        currentElement = currentElement.parentElement;
                    }
                    
                    if (isTitleOrTagField) {
                        // Text selected in a title or tags field: keep normal state (actions visible, formatting hidden)
                        for (var i = 0; i < textFormatButtons.length; i++) {
                            textFormatButtons[i].classList.remove('show-on-selection');
                        }
                        for (var i = 0; i < noteActionButtons.length; i++) {
                            noteActionButtons[i].classList.remove('hide-on-selection');
                        }
                    } else if (editableElement) {
                        // Text selected in an editable area: show formatting buttons, hide actions
                        for (var i = 0; i < textFormatButtons.length; i++) {
                            textFormatButtons[i].classList.add('show-on-selection');
                        }
                        for (var i = 0; i < noteActionButtons.length; i++) {
                            noteActionButtons[i].classList.add('hide-on-selection');
                        }
                    } else {
                        // Text selected but not in an editable area: hide everything
                        for (var i = 0; i < textFormatButtons.length; i++) {
                            textFormatButtons[i].classList.remove('show-on-selection');
                        }
                        for (var i = 0; i < noteActionButtons.length; i++) {
                            noteActionButtons[i].classList.add('hide-on-selection');
                        }
                    }
                } else {
                    // No text selection: show actions, hide formatting
                    for (var i = 0; i < textFormatButtons.length; i++) {
                        textFormatButtons[i].classList.remove('show-on-selection');
                    }
                    for (var i = 0; i < noteActionButtons.length; i++) {
                        noteActionButtons[i].classList.remove('hide-on-selection');
                    }
                }
            
        }, 50); // Short delay to avoid too frequent calls
    }
    
    // Listen to selection changes
    document.addEventListener('selectionchange', handleSelectionChange);
    
    // Also listen to clicks to handle cases where selection is removed
    document.addEventListener('click', function(e) {
        // Wait a bit for the selection to be updated
        setTimeout(handleSelectionChange, 10);
    });
}

// Helper function to load a note by ID
function loadNoteById(noteId) {
    var workspace = selectedWorkspace || 'Poznote';
    var url = 'index.php?workspace=' + encodeURIComponent(workspace) + '&note=' + noteId;
    
    // Use the existing loadNoteDirectly function if available
    if (typeof window.loadNoteDirectly === 'function') {
        window.loadNoteDirectly(url, noteId, null);
    } else {
        // Fallback: navigate directly
        window.location.href = url;
    }
}

// Helper function to switch workspace with callback
function switchWorkspace(targetWorkspace, callback) {
    // If switching to a different workspace, we need to reload the entire page
    // to refresh the left column with notes from the new workspace
    if (typeof selectedWorkspace !== 'undefined' && selectedWorkspace !== targetWorkspace) {
        // Build the URL for the new workspace with the target note
        var url = 'index.php?workspace=' + encodeURIComponent(targetWorkspace);
        
        // If there's a callback that would load a note, extract the note ID from it
        // Since we're reloading the page, we can append the note parameter
        if (callback) {
            // Try to detect if callback will load a note
            // For now, we'll just reload to the workspace and let the callback handle the note
            window.location.href = url;
        } else {
            window.location.href = url;
        }
    } else {
        // Same workspace, just update the variable and call callback
        if (typeof selectedWorkspace !== 'undefined') {
            selectedWorkspace = targetWorkspace;
        }
        if (callback) {
            callback();
        }
    }
}

// Expose updateNote globally for use in other modules
window.updateNote = updateNote;
