// Event and user interaction management

// Auto-save system variables
var saveTimeout;
var lastSavedContent = null;
var lastSavedTitle = null;
var lastSavedTags = null;
var isOnline = navigator.onLine;
var notesNeedingRefresh = new Set(); // Track notes that were left before auto-save completed

// Expose critical functions globally early to prevent ReferenceError during HTML event handlers
// These may be called before events.js is fully loaded due to inline onfocus handlers
function updateident(el) {
    if (el && el.id) noteid = el.id.substr(5);
}
function updateidhead(el) {
    if (el && el.id) noteid = el.id.substr(3);
}
function updateidtags(el) {
    if (el && el.id) noteid = el.id.substr(4);
}
function updateidfolder(el) {
    if (el && el.id) noteid = el.id.substr(6);
}
function updateidsearch(el) {
    if (el && el.id) noteid = el.id.substr(5);
}

// Expose to window early
window.updateident = updateident;
window.updateidhead = updateidhead;
window.updateidtags = updateidtags;
window.updateidfolder = updateidfolder;
window.updateidsearch = updateidsearch;

// Utility function to serialize checklist data
function serializeChecklists(entryElement) {
    if (!entryElement) return;
    
    var checklists = entryElement.querySelectorAll('.checklist');
    checklists.forEach(function(checklist) {
        var items = checklist.querySelectorAll('.checklist-item');
        items.forEach(function(item) {
            var checkbox = item.querySelector('.checklist-checkbox');
            var input = item.querySelector('.checklist-input');
            if (checkbox && input) {
                checkbox.setAttribute('data-checked', checkbox.checked ? '1' : '0');
                input.setAttribute('data-value', input.value);
                input.setAttribute('value', input.value);
                if (checkbox.checked) {
                    checkbox.setAttribute('checked', 'checked');
                } else {
                    checkbox.removeAttribute('checked');
                }
            }
        });
    });
}

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
    
    // Initialize auto-save system
    initializeAutoSaveSystem();
    
    // Warning before page close
    setupPageUnloadWarning();
    
    
}

function setupNoteEditingEvents() {
    var eventTypes = ['keyup', 'input', 'paste', 'change'];
    
    for (var i = 0; i < eventTypes.length; i++) {
        var eventType = eventTypes[i];
        document.body.addEventListener(eventType, function(e) {
            // Handle checklist checkbox changes (auto-save)
            if (e.target && e.target.classList && e.target.classList.contains('checklist-checkbox')) {
                // IMPORTANT: Set noteid from the noteentry element
                var noteentry = e.target.closest('.noteentry');
                if (noteentry) {
                    var noteIdFromEntry = noteentry.id.replace('entry', '');
                    if (noteIdFromEntry) {
                        noteid = noteIdFromEntry;
                    }
                }
                
                // Serialize checklist state BEFORE save
                if (noteentry && typeof serializeChecklistsBeforeSave === 'function') {
                    serializeChecklistsBeforeSave(noteentry);
                }
                
                if (typeof window.markNoteAsModified === 'function') {
                    window.markNoteAsModified();
                }
                return;
            }
            
            // Handle checklist text input changes (auto-save)
            if (e.target && e.target.classList && e.target.classList.contains('checklist-input')) {
                if (eventType === 'input' || eventType === 'keyup' || eventType === 'change') {
                    // IMPORTANT: Set noteid from the noteentry element
                    var noteentry = e.target.closest('.noteentry');
                    if (noteentry) {
                        var noteIdFromEntry = noteentry.id.replace('entry', '');
                        if (noteIdFromEntry) {
                            noteid = noteIdFromEntry;
                        }
                    }
                    
                    // Serialize checklist state BEFORE save
                    if (noteentry && typeof serializeChecklistsBeforeSave === 'function') {
                        serializeChecklistsBeforeSave(noteentry);
                    }
                    
                    if (typeof window.markNoteAsModified === 'function') {
                        window.markNoteAsModified();
                    }
                }
                return;
            }
            
            handleNoteEditEvent(e);
        });
    }
    
    // Handle Enter key and delete empty checklists
    document.body.addEventListener('keydown', function(e) {
        if (e.target && e.target.classList && e.target.classList.contains('checklist-input')) {
            handleChecklistKeydown(e);
            return;
        }
        
        handleTagsKeydown(e);
        handleTitleKeydown(e);
    });
    
    // Special handling for title blur and keydown events (Enter/Escape)
    document.body.addEventListener('blur', function(e) {
        handleTitleBlur(e);
    }, true); // Use capture phase to ensure we catch the event
}

function handleChecklistKeydown(e) {
    var input = e.target;
    
    if (e.key === 'Enter') {
        e.preventDefault();
        
        var checklistItem = input.closest('.checklist-item');
        if (!checklistItem) return;
        
        var checklist = checklistItem.closest('.checklist');
        if (!checklist) return;
        
        // IMPORTANT: Set noteid from the noteentry element
        var noteentry = checklist.closest('.noteentry');
        if (noteentry) {
            var noteIdFromEntry = noteentry.id.replace('entry', '');
            if (noteIdFromEntry) {
                noteid = noteIdFromEntry;
            }
        }
        
        var textValue = input.value.trim();
        
        if (textValue === '') {
            // Empty item - delete it and create a paragraph
            var paragraph = document.createElement('p');
            paragraph.textContent = '';
            
            checklist.parentNode.insertBefore(paragraph, checklist.nextSibling);
            checklistItem.remove();
            
            // Focus the new paragraph
            var range = document.createRange();
            range.selectNodeContents(paragraph);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            paragraph.focus();
        } else {
            // Create new item with text from current input
            var newLi = document.createElement('li');
            newLi.className = 'checklist-item';
            
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'checklist-checkbox';
            
            var newInput = document.createElement('input');
            newInput.type = 'text';
            newInput.className = 'checklist-input';
            newInput.style.border = 'none';
            newInput.style.background = 'none';
            newInput.style.padding = '0';
            newInput.style.fontFamily = 'inherit';
            newInput.style.fontSize = 'inherit';
            newInput.style.width = 'calc(100% - 30px)';
            
            newLi.appendChild(checkbox);
            newLi.appendChild(document.createTextNode(' '));
            newLi.appendChild(newInput);
            
            checklistItem.parentNode.insertBefore(newLi, checklistItem.nextSibling);
            
            // Focus the new input
            newInput.focus();
        }
        
        // Serialize and trigger save
        var noteentry = checklist.closest('.noteentry');
        if (noteentry && typeof serializeChecklistsBeforeSave === 'function') {
            serializeChecklistsBeforeSave(noteentry);
        }
        
        if (typeof window.markNoteAsModified === 'function') {
            window.markNoteAsModified();
        }
    } else if (e.key === 'Backspace') {
        // Handle Backspace key
        var checklistItem = input.closest('.checklist-item');
        if (!checklistItem) return;
        
        var checklist = checklistItem.closest('.checklist');
        if (!checklist) return;
        
        // Check if cursor is at the beginning of the input
        var cursorPos = input.selectionStart;
        var textValue = input.value;
        
        if (cursorPos === 0 && textValue === '') {
            // Empty item at the beginning - delete it
            e.preventDefault();
            
            // IMPORTANT: Set noteid from the noteentry element
            var noteentry = checklist.closest('.noteentry');
            if (noteentry) {
                var noteIdFromEntry = noteentry.id.replace('entry', '');
                if (noteIdFromEntry) {
                    noteid = noteIdFromEntry;
                }
            }
            
            // Get the previous item to focus on
            var previousItem = checklistItem.previousElementSibling;
            
            // Remove current item
            checklistItem.remove();
            
            // If there are no more items in the checklist, remove the entire checklist
            var remainingItems = checklist.querySelectorAll('.checklist-item');
            if (remainingItems.length === 0) {
                // Create a paragraph before removing the checklist
                var paragraph = document.createElement('p');
                paragraph.textContent = '';
                
                checklist.parentNode.insertBefore(paragraph, checklist);
                checklist.remove();
                
                // Focus the new paragraph
                var range = document.createRange();
                range.selectNodeContents(paragraph);
                range.collapse(true);
                var sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                paragraph.focus();
            } else if (previousItem && previousItem.classList.contains('checklist-item')) {
                // Focus on the previous item's input
                var previousInput = previousItem.querySelector('.checklist-input');
                if (previousInput) {
                    previousInput.focus();
                    // Move cursor to the end of the previous item
                    previousInput.setSelectionRange(previousInput.value.length, previousInput.value.length);
                }
            } else {
                // Focus on the first remaining item
                var firstInput = checklist.querySelector('.checklist-input');
                if (firstInput) {
                    firstInput.focus();
                }
            }
            
            // Serialize and trigger save
            if (noteentry && typeof serializeChecklistsBeforeSave === 'function') {
                serializeChecklistsBeforeSave(noteentry);
            }
            
            if (typeof window.markNoteAsModified === 'function') {
                window.markNoteAsModified();
            }
        }
        // Note: We do NOT prevent default for non-empty items or when cursor is not at start
        // This allows normal text deletion to work
    } else if (e.key === 'ArrowDown' || e.key === 'Down') {
        // Handle arrow down - navigate to next checklist item
        var checklistItem = input.closest('.checklist-item');
        if (!checklistItem) return;
        
        var cursorPos = input.selectionStart;
        var textLength = input.value.length;
        
        // Only intercept if cursor is at the end of the line
        if (cursorPos === textLength) {
            var nextItem = checklistItem.nextElementSibling;
            if (nextItem && nextItem.classList.contains('checklist-item')) {
                e.preventDefault();
                var nextInput = nextItem.querySelector('.checklist-input');
                if (nextInput) {
                    nextInput.focus();
                    // Move cursor to the beginning of the next item
                    nextInput.setSelectionRange(0, 0);
                }
            }
            // If there's no next item, allow default behavior to exit the checklist
        }
    } else if (e.key === 'ArrowUp' || e.key === 'Up') {
        // Handle arrow up - navigate to previous checklist item
        var checklistItem = input.closest('.checklist-item');
        if (!checklistItem) return;
        
        var cursorPos = input.selectionStart;
        
        // Only intercept if cursor is at the beginning of the line
        if (cursorPos === 0) {
            var previousItem = checklistItem.previousElementSibling;
            if (previousItem && previousItem.classList.contains('checklist-item')) {
                e.preventDefault();
                var previousInput = previousItem.querySelector('.checklist-input');
                if (previousInput) {
                    previousInput.focus();
                    // Move cursor to the end of the previous item
                    previousInput.setSelectionRange(previousInput.value.length, previousInput.value.length);
                }
            }
            // If there's no previous item, allow default behavior to exit the checklist
        }
    }
}

function handleNoteEditEvent(e) {
    var target = e.target;
    
    if (target.classList.contains('name_doss')) {
        markNoteAsModified();
    } else if (target.classList.contains('noteentry')) {
        markNoteAsModified();
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
            markNoteAsModified();
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
                
                markNoteAsModified();
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

// Initialize all auto-save and navigation systems
function initializeAutoSaveSystem() {
    setupAutoSaveCheck();
    setupNoteNavigationInterceptor();
    setupNavigationDebugger();
}

// Debug all navigation attempts
function setupNavigationDebugger() {
    // Monitor URL changes
    var originalPushState = history.pushState;
    var originalReplaceState = history.replaceState;
    
    history.pushState = function() {
        return originalPushState.apply(history, arguments);
    };
    
    history.replaceState = function() {
        return originalReplaceState.apply(history, arguments);
    };
    
    // Monitor popstate events
    window.addEventListener('popstate', function(e) {
    });
    
    // Monitor all link clicks
    document.addEventListener('click', function(e) {
        if (e.target.tagName === 'A' || e.target.closest('a')) {
            var link = e.target.tagName === 'A' ? e.target : e.target.closest('a');
        }
    }, true);
}

// Global click interceptor for note navigation links
function setupNoteNavigationInterceptor() {
    
    document.addEventListener('click', function(e) {
        // Check if this is a note link
        var link = e.target.closest('a.links_arbo_left, a[href*="note="]');
        if (!link) return;
        
        
        // Extract target note ID from href
        var href = link.getAttribute('href');
        if (!href) return;
        
        var noteMatch = href.match(/[?&]note=(\d+)/);
        if (!noteMatch) return;
        
        var targetNoteId = noteMatch[1];
        var currentNoteId = window.noteid;
        
        
        // Check for unsaved changes BEFORE allowing navigation
        if (currentNoteId && currentNoteId !== targetNoteId && hasUnsavedChanges(currentNoteId)) {
            // Prevent default navigation
            e.preventDefault();
            e.stopPropagation();
            
            
            // Show temporary notification
            showSaveInProgressNotification(function() {
                // Callback when save is complete - proceed with navigation
                window.location.href = href;
            });
            
            return false;
        }
        
        // No unsaved changes, allow normal navigation
    }, true); // Use capture phase to intercept before other handlers
}

// Show a temporary notification while auto-save is in progress
function showSaveInProgressNotification(onCompleteCallback) {
    // Create notification element
    var notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #007DB8;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        max-width: 300px;
        animation: slideInRight 0.3s ease;
    `;
    
    // Add animation CSS if not already present
    if (!document.getElementById('saveNotificationCSS')) {
        var style = document.createElement('style');
        style.id = 'saveNotificationCSS';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            .save-notification-exit {
                animation: slideOutRight 0.3s ease forwards;
            }
        `;
        document.head.appendChild(style);
    }
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 16px; height: 16px; border: 2px solid #fff; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <span>Saving changes...</span>
        </div>
    `;
    
    // Add spinner animation
    if (!document.getElementById('spinnerCSS')) {
        var spinnerStyle = document.createElement('style');
        spinnerStyle.id = 'spinnerCSS';
        spinnerStyle.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(spinnerStyle);
    }
    
    document.body.appendChild(notification);
    
    // Force immediate save
    var currentNoteId = window.noteid;
    clearTimeout(saveTimeout);
    saveTimeout = null;
    
    if (isOnline) {
        saveToServerDebounced();
    }
    
    // Monitor for save completion
    var checkInterval = setInterval(function() {
        // Check if save is complete (no timeout, not in refresh list, no red dot)
        var noTimeout = !saveTimeout || saveTimeout === null || saveTimeout === undefined;
        var notInRefreshList = !notesNeedingRefresh.has(String(currentNoteId));
        var noRedDot = !document.title.startsWith('🔴');
        
        
        var saveComplete = noTimeout && notInRefreshList && noRedDot;
        
        if (saveComplete) {
            clearInterval(checkInterval);
            clearTimeout(fallbackTimeoutId);
            
            // Change notification to success
            notification.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 16px; height: 16px; color: #fff; font-weight: bold;">✓</div>
                    <span>Saved!</span>
                </div>
            `;
            
            // Remove notification and proceed
            setTimeout(function() {
                notification.classList.add('save-notification-exit');
                setTimeout(function() {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                    if (onCompleteCallback) {
                        onCompleteCallback();
                    }
                }, 300);
            }, 800); // Show "Saved!" for 800ms
        }
    }, 100); // Check every 100ms
    
    // Fallback timeout (in case something goes wrong)
    var fallbackTimeoutId = setTimeout(function() {
        clearInterval(checkInterval);
        
        // Show "Saved!" even if detection failed
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 16px; height: 16px; color: #fff; font-weight: bold;">✓</div>
                <span>Saved!</span>
            </div>
        `;
        
        // Remove notification and proceed
        setTimeout(function() {
            notification.classList.add('save-notification-exit');
            setTimeout(function() {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                if (onCompleteCallback) {
                    onCompleteCallback();
                }
            }, 300);
        }, 800); // Show "Saved!" for 800ms
    }, 3000); // Maximum 3 seconds
}

// Expose the function globally
window.showSaveInProgressNotification = showSaveInProgressNotification;

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
            
            // Check if user has selected text (wants to edit) vs simple click (wants to follow link)
            var selection = window.getSelection();
            var hasSelection = selection && selection.toString().trim().length > 0;
            
            if (hasSelection) {
                // User has selected text - they want to edit the link, not follow it
                // Do nothing here, let the normal selection behavior work
                // The toolbar's link button will handle editing
                return;
            }
            
            // No selection - user wants to follow the link
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
                
                // Code block auto-creation has been removed
                // Text will paste normally without automatic formatting
                
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
                        if (typeof markNoteAsModified === 'function') {
                            markNoteAsModified();
                        }
                    }
                }
            }
        } catch (err) {
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
    // Modern auto-save: local storage + debounced server sync
    // No longer using periodic checks - saves happen immediately locally and debounced to server
    
    // Setup online/offline detection
    window.addEventListener('online', function() {
        isOnline = true;
        // Try to sync any pending changes
        if (noteid !== -1 && noteid !== 'search' && noteid !== null && noteid !== undefined) {
            var draftKey = 'poznote_draft_' + noteid;
            var draft = localStorage.getItem(draftKey);
            if (draft && draft !== lastSavedContent) {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    saveToServerDebounced();
                }, 1000); // Shorter delay when coming back online
            }
        }
        updateConnectionStatus(true);
    });
    
    window.addEventListener('offline', function() {
        isOnline = false;
        updateConnectionStatus(false);
    });
}

function updateConnectionStatus(online) {
    // Auto-save status - console only, no visual indicators
    if (online) {
        // Remove from refresh list since it's now saved
        notesNeedingRefresh.delete(String(noteid));
    } else {
    }
}

// Make it globally available
window.updateConnectionStatus = updateConnectionStatus;

function setupPageUnloadWarning() {
    window.addEventListener('beforeunload', function (e) {
        // Try to save any pending changes before leaving
        if (noteid !== -1 && noteid !== 'search' && noteid !== null && noteid !== undefined) {
            try {
                var draftKey = 'poznote_draft_' + noteid;
                var draft = localStorage.getItem(draftKey);
                if (draft) {
                    // Use emergency save for reliable final save
                    emergencySave(noteid);
                }
            } catch (err) {
            }
        }
        // No confirmation popup needed - auto-save handles everything
    });
}

// Utility functions
function markNoteAsModified() {
    if (noteid == 'search' || noteid == -1 || noteid === null || noteid === undefined) return;
    
    // Check if there are actually changes before triggering save process
    var entryElem = document.getElementById("entry" + noteid);
    var titleInput = document.getElementById("inp" + noteid);
    var tagsElem = document.getElementById("tags" + noteid);
    
    var currentContent = entryElem ? entryElem.innerHTML : '';
    var currentTitle = titleInput ? titleInput.value : '';
    var currentTags = tagsElem ? tagsElem.value : '';
    
    // Initialize lastSaved states if not set
    if (typeof lastSavedContent === 'undefined') lastSavedContent = null;
    if (typeof lastSavedTitle === 'undefined') lastSavedTitle = null;
    if (typeof lastSavedTags === 'undefined') lastSavedTags = null;
    
    
    var contentChanged = currentContent !== lastSavedContent;
    var titleChanged = currentTitle !== lastSavedTitle;
    var tagsChanged = currentTags !== lastSavedTags;
    
    if (!contentChanged && !titleChanged && !tagsChanged) {
        return;
    }
    
    
    // Modern auto-save: save to localStorage immediately
    saveToLocalStorage();
    
    // Mark this note as having pending changes (until server save completes)
    notesNeedingRefresh.add(String(noteid));
    
    // Visual indicator: add red dot to page title when there are unsaved changes
    if (!document.title.startsWith('🔴')) {
        document.title = '🔴 ' + document.title;
    }
    
    // Debounced server save
    clearTimeout(saveTimeout);
    var currentNoteId = noteid; // Capture current note ID
    saveTimeout = setTimeout(() => {
        // Only save if we're still on the same note
        if (noteid === currentNoteId && isOnline) {
            saveToServerDebounced();
        } else if (noteid !== currentNoteId) {
        }
    }, 2000); // 2 second debounce
}

function saveToLocalStorage() {
    if (noteid == 'search' || noteid == -1 || noteid === null || noteid === undefined) return;
    
    try {
        var entryElem = document.getElementById("entry" + noteid);
        var titleInput = document.getElementById("inp" + noteid);
        var tagsElem = document.getElementById("tags" + noteid);
        
        if (entryElem) {
            // Serialize checklist data before saving
            serializeChecklists(entryElem);
            
            var content = entryElem.innerHTML;
            var draftKey = 'poznote_draft_' + noteid;
            localStorage.setItem(draftKey, content);
            
            // Also save title and tags
            if (titleInput) {
                localStorage.setItem('poznote_title_' + noteid, titleInput.value);
            }
            if (tagsElem) {
                localStorage.setItem('poznote_tags_' + noteid, tagsElem.value);
            }
        }
    } catch (err) {
    }
}

function saveToServerDebounced() {
    if (noteid == 'search' || noteid == -1 || noteid === null || noteid === undefined) return;
    
    // Clear the timeout since we're executing the save now
    clearTimeout(saveTimeout);
    saveTimeout = null;
    
    // Check that the note elements still exist (user might have navigated away)
    var titleInput = document.getElementById("inp" + noteid);
    var entryElem = document.getElementById("entry" + noteid);
    if (!titleInput || !entryElem) {
        return;
    }
    
    // Check if content has actually changed
    var draftKey = 'poznote_draft_' + noteid;
    var titleKey = 'poznote_title_' + noteid;
    var tagsKey = 'poznote_tags_' + noteid;
    
    var currentDraft = localStorage.getItem(draftKey);
    var currentTitle = localStorage.getItem(titleKey);
    var currentTags = localStorage.getItem(tagsKey);
    
    var contentChanged = currentDraft !== lastSavedContent;
    var titleChanged = currentTitle !== lastSavedTitle;
    var tagsChanged = currentTags !== lastSavedTags;
    
    if (!contentChanged && !titleChanged && !tagsChanged) {
        // No changes detected
        return;
    }
    
    
    // Trigger server save
    saveNoteToServer();
}

// Functions for element IDs
// Alias for compatibility
function newnote() {
    createNewNote();
}

function saveNoteImmediately() {
    saveNoteToServer();
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

// Check if current note has unsaved changes (pending server save)
function hasUnsavedChanges(noteId) {
    if (!noteId || noteId == -1 || noteId == 'search') return false;
    
    
    // Check if there's a pending server save timeout
    if (saveTimeout !== null && saveTimeout !== undefined) {
        return true;
    }
    
    // Check if note is marked as needing refresh (has pending changes)
    if (notesNeedingRefresh.has(String(noteId))) {
        return true;
    }
    
    // Also check if page title still has unsaved indicator
    if (document.title.startsWith('🔴')) {
        return true;
    }
    
    return false;
}

// Check before leaving a note with unsaved changes
function checkUnsavedBeforeLeaving(targetNoteId) {
    var currentNoteId = window.noteid;
    
    if (!currentNoteId || currentNoteId == -1 || currentNoteId == 'search') return true;
    
    // If staying on same note, no need to check
    if (String(currentNoteId) === String(targetNoteId)) return true;
    
    if (hasUnsavedChanges(currentNoteId)) {
        var message = "⚠️ Unsaved Changes Detected\n\n" +
                     "You have unsaved changes that will be lost if you switch now.\n\n" +
                     "Click OK to save and continue, or Cancel to stay.\n" +
                     "(Auto-save occurs 2 seconds after you stop typing)";
        
        if (confirm(message)) {
            // Force immediate save
            clearTimeout(saveTimeout);
            saveTimeout = null;
            
            // Immediate server save
            if (isOnline) {
                saveToServerDebounced();
            }
            
            // Small delay to let save complete
            setTimeout(() => {
                notesNeedingRefresh.delete(String(currentNoteId));
            }, 500);
            
            return true;
        } else {
            return false;
        }
    }
    
    return true;
}

// Emergency save function for page unload scenarios
function emergencySave(noteId) {
    if (!noteId || noteId == -1 || noteId == 'search') return;
    
    var entryElem = document.getElementById("entry" + noteId);
    var titleInput = document.getElementById("inp" + noteId);
    var tagsElem = document.getElementById("tags" + noteId);
    var folderElem = document.getElementById("folder" + noteId);
    
    if (!entryElem || !titleInput) {
        return;
    }
    
    // Serialize checklist data before saving
    serializeChecklists(entryElem);
    
    var headi = titleInput.value || '';
    var ent = entryElem.innerHTML.replace(/<br\s*[\/]?>/gi, "&nbsp;<br>");
    var tags = tagsElem ? tagsElem.value : '';
    var folder = folderElem ? folderElem.value : (window.getDefaultFolderName ? window.getDefaultFolderName() : 'General');
    
    var params = {
        id: noteId,
        heading: headi,
        entry: ent,
        tags: tags,
        folder: folder,
        workspace: (window.selectedWorkspace || 'Poznote')
    };
    
    // Strategy 1: Try fetch with keepalive (most reliable)
    try {
        fetch("api_update_note.php", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(params),
            keepalive: true
        }).then(function() {
        }).catch(function(err) {
            console.error('[Poznote Auto-Save] Emergency fetch failed:', err);
        });
    } catch (err) {
        
        // Strategy 2: Fallback to sendBeacon with FormData (some servers accept this)
        try {
            var formData = new FormData();
            formData.append('action', 'beacon_save'); // Use beacon_save action for API compatibility
            formData.append('note_id', noteId);
            formData.append('content', ent);
            formData.append('workspace', window.selectedWorkspace || 'Poznote');
            
            if (navigator.sendBeacon('api_update_note.php', formData)) {
            } else {
                console.error('[Poznote Auto-Save] sendBeacon returned false');
            }
        } catch (beaconErr) {
            console.error('[Poznote Auto-Save] sendBeacon failed:', beaconErr);
            
            // Strategy 3: Last resort - synchronous XMLHttpRequest (deprecated but works)
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', 'api_update_note.php', false); // false = synchronous
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                xhr.send(JSON.stringify(params));
            } catch (xhrErr) {
                console.error('[Poznote Auto-Save] All emergency save strategies failed:', xhrErr);
            }
        }
    }
}

// Expose markNoteAsModified globally for use in other modules
window.markNoteAsModified = markNoteAsModified;
window.saveNoteImmediately = saveNoteImmediately;
window.checkUnsavedBeforeLeaving = checkUnsavedBeforeLeaving;
window.hasUnsavedChanges = hasUnsavedChanges;

// Warn user when leaving page with unsaved changes
window.addEventListener('beforeunload', function(e) {
    var currentNoteId = window.noteid;
    if (hasUnsavedChanges(currentNoteId)) {
        // Force immediate save before leaving
        if (isOnline) {
            try {
                emergencySave(currentNoteId);
            } catch (err) {
                console.error('[Poznote Auto-Save] Emergency save failed:', err);
            }
        }
        
        // Show browser warning
        var message = '⚠️ You have unsaved changes. Are you sure you want to leave?';
        e.preventDefault();
        e.returnValue = message;
        return message;
    }
});

// Warn user when using browser back/forward with unsaved changes
window.addEventListener('popstate', function(e) {
    var currentNoteId = window.noteid;
    if (hasUnsavedChanges(currentNoteId)) {
        var message = "⚠️ Unsaved Changes\n\n" +
                     "You have unsaved changes that will be lost.\n" +
                     "Save before navigating away?";
        
        if (confirm(message)) {
            // Force immediate save
            clearTimeout(saveTimeout);
            saveTimeout = null;
            
            if (isOnline) {
                saveToServerDebounced();
            }
            
            notesNeedingRefresh.delete(String(currentNoteId));
        }
        // Continue with navigation regardless of user choice
    }
});

// Draft restoration functions
function checkForUnsavedDraft(noteId, skipAutoRestore) {
    if (!noteId || noteId == -1 || noteId == 'search') return;
    
    
    try {
        var draftKey = 'poznote_draft_' + noteId;
        var titleKey = 'poznote_title_' + noteId;
        var tagsKey = 'poznote_tags_' + noteId;
        
        var draftContent = localStorage.getItem(draftKey);
        var draftTitle = localStorage.getItem(titleKey);
        var draftTags = localStorage.getItem(tagsKey);
        
        if (draftContent) {
            var entryElem = document.getElementById('entry' + noteId);
            var titleInput = document.getElementById('inp' + noteId);
            var tagsInput = document.getElementById('tags' + noteId);
            
            // Check if draft is different from current content
            var currentContent = entryElem ? entryElem.innerHTML : '';
            var currentTitle = titleInput ? titleInput.value : '';
            var currentTags = tagsInput ? tagsInput.value : '';
            
            var hasUnsavedChanges = (draftContent !== currentContent) || 
                                   (draftTitle && draftTitle !== currentTitle) || 
                                   (draftTags && draftTags !== currentTags);
            
            if (hasUnsavedChanges && !skipAutoRestore) {
                // Restore draft automatically without asking
                restoreDraft(noteId, draftContent, draftTitle, draftTags);
            } else if (hasUnsavedChanges && skipAutoRestore) {
                // Draft exists but we're skipping auto-restore (note was refreshed from server)
                // Clear old draft since server content is more recent
                clearDraft(noteId);
                // Initialize with current server content
                var entryElem = document.getElementById('entry' + noteId);
                var titleInput = document.getElementById('inp' + noteId);
                var tagsElem = document.getElementById('tags' + noteId);
                if (entryElem) {
                    lastSavedContent = entryElem.innerHTML;
                }
                if (titleInput) {
                    lastSavedTitle = titleInput.value;
                }
                if (tagsElem) {
                    lastSavedTags = tagsElem.value;
                }
            } else {
                // No unsaved changes, initialize lastSaved* variables
                lastSavedContent = draftContent;
                
                var titleInput = document.getElementById('inp' + noteId);
                var tagsElem = document.getElementById('tags' + noteId);
                if (titleInput) {
                    lastSavedTitle = titleInput.value;
                }
                if (tagsElem) {
                    lastSavedTags = tagsElem.value;
                }
            }
        } else {
            // Initialize lastSaved* variables with current content
            var entryElem = document.getElementById('entry' + noteId);
            var titleInput = document.getElementById('inp' + noteId);
            var tagsElem = document.getElementById('tags' + noteId);
            if (entryElem) {
                lastSavedContent = entryElem.innerHTML;
            }
            if (titleInput) {
                lastSavedTitle = titleInput.value;
            }
            if (tagsElem) {
                lastSavedTags = tagsElem.value;
            }
        }
    } catch (err) {
    }
}

function restoreDraft(noteId, content, title, tags) {
    var entryElem = document.getElementById('entry' + noteId);
    var titleInput = document.getElementById('inp' + noteId);
    var tagsInput = document.getElementById('tags' + noteId);
    
    if (entryElem && content) {
        entryElem.innerHTML = content;
    }
    if (titleInput && title) {
        titleInput.value = title;
    }
    if (tagsInput && tags) {
        tagsInput.value = tags;
    }
    
    // Auto-save will handle the restored content automatically
}

function clearDraft(noteId) {
    try {
        localStorage.removeItem('poznote_draft_' + noteId);
        localStorage.removeItem('poznote_title_' + noteId);
        localStorage.removeItem('poznote_tags_' + noteId);
    } catch (err) {
    }
}

function reinitializeAutoSaveState() {
    // Get current note ID from the DOM
    var currentNoteId = null;
    var entryElem = document.querySelector('[id^="entry"]:not([id*="search"])');
    if (entryElem) {
        currentNoteId = entryElem.id.replace('entry', '');
    }
    
    if (currentNoteId && currentNoteId !== 'search' && currentNoteId !== '-1') {
        
        // Update global noteid
        if (typeof window !== 'undefined') {
            window.noteid = currentNoteId;
        }
        
        // Initialize lastSaved* variables with current server content (freshly loaded)
        var entryContent = entryElem.innerHTML;
        var titleInput = document.getElementById('inp' + currentNoteId);
        var tagsElem = document.getElementById('tags' + currentNoteId);
        
        if (typeof lastSavedContent !== 'undefined') {
            lastSavedContent = entryContent;
        }
        if (typeof lastSavedTitle !== 'undefined' && titleInput) {
            lastSavedTitle = titleInput.value;
        }
        if (typeof lastSavedTags !== 'undefined' && tagsElem) {
            lastSavedTags = tagsElem.value;
        }
        
        // Clear any stale draft for this note since we just loaded fresh content
        clearDraft(currentNoteId);
        
        // Remove from refresh list if present
        if (typeof notesNeedingRefresh !== 'undefined') {
            var wasInList = notesNeedingRefresh.has(String(currentNoteId));
            notesNeedingRefresh.delete(String(currentNoteId));
        }
        
    }
}

// Make functions globally available
window.checkForUnsavedDraft = checkForUnsavedDraft;
window.clearDraft = clearDraft;
window.reinitializeAutoSaveState = reinitializeAutoSaveState;
window.setupDragDropEvents = setupDragDropEvents;
window.setupNoteDragDropEvents = setupNoteDragDropEvents;
window.setupLinkEvents = setupLinkEvents;
window.setupFocusEvents = setupFocusEvents;
window.setupAutoSaveCheck = setupAutoSaveCheck;
window.setupPageUnloadWarning = setupPageUnloadWarning;
window.initTextSelectionHandlers = initTextSelectionHandlers;
window.initializeAutoSaveSystem = initializeAutoSaveSystem;
