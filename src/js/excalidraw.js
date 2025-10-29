// Excalidraw integration for Poznote
// Handles creation and opening of Excalidraw diagram notes

// Open existing Excalidraw note for editing
function openExcalidrawNote(noteId) {
    // Disable Excalidraw editing on mobile devices (< 800px)
    if (window.innerWidth < 800) {
        if (typeof window.showError === 'function') {
            window.showError('Excalidraw editing is disabled on small screens for a better user experience.', 'Editing not available');
        } else {
            alert('Excalidraw editing is disabled on mobile devices.');
        }
        return false;
    }
    
    var params = new URLSearchParams({
        note_id: noteId,
        workspace: selectedWorkspace || 'Poznote'
    });
    
    // Redirect to Excalidraw editor
    window.location.href = 'excalidraw_editor.php?' + params.toString();
}

/**
 * Check if cursor is in an editable note area
 */
function isCursorInEditableNote() {
    const selection = window.getSelection();
    
    // Check if there's a selection/cursor
    if (!selection.rangeCount) {
        return false;
    }
    
    // Get the current element
    const range = selection.getRangeAt(0);
    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) { // Text node
        container = container.parentNode;
    }
    
    // Check if we're inside a contenteditable note area
    const editableElement = container.closest && container.closest('[contenteditable="true"]');
    const noteEntry = container.closest && container.closest('.noteentry');
    const markdownEditor = container.closest && container.closest('.markdown-editor');
    
    // Return true if we're in any editable note context
    return (editableElement && noteEntry) || markdownEditor || (editableElement && editableElement.classList.contains('noteentry'));
}

// Insert Excalidraw diagram at cursor position in a note
function insertExcalidrawDiagram() {
    // Disable Excalidraw insertion on mobile devices (< 800px)
    if (window.innerWidth < 800) {
        if (typeof window.showError === 'function') {
            window.showError('Excalidraw editing is disabled on small screens for a better user experience.', 'Editing not available');
        } else {
            alert('Excalidraw editing is disabled on screens smaller than 800px.');
        }
        return false;
    }
    
    // Check if cursor is in editable note first
    if (!isCursorInEditableNote()) {
        showCursorWarning();
        return;
    }
    
    // Check if the current note has content
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) {
        window.showError('Please save the note before adding diagrams', 'Unsaved note');
        return;
    }
    
    // Get the current note content
    const noteEntry = document.getElementById('entry' + currentNoteId);
    if (!noteEntry) {
        window.showError('Note editor not found', 'Error');
        return;
    }
    
    // Create a unique ID for this diagram
    const diagramId = 'excalidraw-' + Date.now();
    
    // Check if we're on mobile to adapt the button behavior
    const isMobile = window.innerWidth < 800;
    
    // Create simple button for the Excalidraw diagram
    let diagramHTML;
    if (isMobile) {
        // On mobile, create a disabled button with a different onclick that shows an alert
        diagramHTML = `<button class="excalidraw-btn excalidraw-btn-mobile" id="${diagramId}" onclick="showMobileExcalidrawAlert()" style="cursor: not-allowed; background: #6c757d; color: white; border: none; padding: 8px 12px; border-radius: 4px; font-size: 14px; margin: 4px; opacity: 0.7;" title="Excalidraw editing disabled on mobile">Excalidraw (Mobile editing disabled)</button><br><br>`;
    } else {
        // On desktop, normal behavior
        diagramHTML = `<button class="excalidraw-btn" id="${diagramId}" onclick="openExcalidrawEditor('${diagramId}')" style="cursor: pointer; background: #007DB8; color: white; border: none; padding: 8px 12px; border-radius: 4px; font-size: 14px; margin: 4px;" title="Open Excalidraw diagram editor">Click here to create your Excalidraw image here</button><br><br>`;
    }
    
    // Insert at cursor position
    insertHtmlAtCursor(diagramHTML);
    
    // Trigger automatic save to ensure placeholder is saved before opening editor
    if (typeof updateNote === 'function') {
        markNoteAsModified(); // Mark note as edited and start debounce timer (2 seconds)
    }
    
    // Wait for the debounced save to complete before opening editor
    // The auto-save system has a 2-second debounce, so we wait slightly longer to be safe
    if (!isMobile) {
        // Show loading spinner
        const spinner = window.showLoadingSpinner('Saving diagram placeholder...', 'Loading');
        
        // Wait 2.5 seconds (accounting for 2-second debounce + small buffer)
        setTimeout(function() {
            openExcalidrawEditor(diagramId);
            // Note: spinner will be closed when page navigates to editor
        }, 2500); // Wait for debounced save to complete
    }
}

// Open Excalidraw editor for a specific diagram
function openExcalidrawEditor(diagramId) {
    // Disable Excalidraw editing on mobile devices (< 800px)
    if (window.innerWidth < 800) {
        if (typeof window.showError === 'function') {
            window.showError('Excalidraw editing is disabled on small screens for a better user experience.', 'Editing not available');
        } else {
            alert('Excalidraw editing is disabled on mobile devices.');
        }
        return false;
    }
    
    // Store the current note context
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) {
        window.showError('Please save the note before editing diagrams', 'Unsaved note');
        return;
    }
    
    // Store diagram context in sessionStorage
    sessionStorage.setItem('excalidraw_context', JSON.stringify({
        noteId: currentNoteId,
        diagramId: diagramId,
        returnUrl: window.location.href
    }));
    
    // Redirect to Excalidraw editor with diagram context
    const params = new URLSearchParams({
        diagram_id: diagramId,
        note_id: currentNoteId,
        workspace: selectedWorkspace || 'Poznote'
    });
    
    window.location.href = 'excalidraw_editor.php?' + params.toString();
}

// Helper function to get current note ID
function getCurrentNoteId() {
    // Try to get from global noteid variable first (most reliable)
    if (typeof noteid !== 'undefined' && noteid !== -1 && noteid !== null && noteid !== 'search') {
        return noteid;
    }
    
    // Try to get note ID from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const noteId = urlParams.get('note');
    if (noteId) {
        return noteId;
    }
    
    // Try to get from focused note element
    const focusedNote = document.querySelector('.note-item.focused');
    if (focusedNote) {
        const noteElement = focusedNote.closest('[id^="note"]');
        if (noteElement) {
            return noteElement.id.replace('note', '');
        }
    }
    
    return null;
}

// Helper function to insert HTML at cursor position
function insertHtmlAtCursor(html) {
    let selection = window.getSelection();
    let insertionSuccessful = false;
    
    // If there's a current selection, use it
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const fragment = range.createContextualFragment(html);
        range.deleteContents();
        range.insertNode(fragment);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        insertionSuccessful = true;
    } else {
        // No selection, try to find the note content area and insert at the end
        const noteContentElement = document.querySelector('.note-content[contenteditable="true"]') || 
                                   document.querySelector('#note-content[contenteditable="true"]') ||
                                   document.querySelector('[contenteditable="true"]');
        
        if (noteContentElement) {
            noteContentElement.focus();
            
            // Create a range at the end of the content
            const range = document.createRange();
            range.selectNodeContents(noteContentElement);
            range.collapse(false); // Move to end
            
            // Insert the HTML
            const fragment = range.createContextualFragment(html);
            range.insertNode(fragment);
            range.collapse(false);
            
            // Update selection
            selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            
            insertionSuccessful = true;
        }
    }
    
    // If we still couldn't insert, show a notification
    if (!insertionSuccessful) {
        if (window.showNotificationPopup) {
            showNotificationPopup('Could not find note content area to insert diagram', 'warning');
        } else {
            window.showError('Unable to find note content area to insert diagram', 'Insertion Error');
        }
    }
}

// Download Excalidraw diagram as PNG image
function downloadExcalidrawImage(noteId) {
    // Get the PNG file path for this note
    const pngPath = `data/entries/${noteId}.png`;
    
    // Check if PNG exists by trying to load it
    const img = new Image();
    img.onload = function() {
        // PNG exists, download it
        downloadImageFromUrl(pngPath, `excalidraw-diagram-${noteId}.png`);
    };
    img.onerror = function() {
        // PNG doesn't exist, show error message
        console.error('Excalidraw PNG not found for note ' + noteId);
        window.showError('Excalidraw image not found. Please open the diagram in the editor and save it first.', 'Image not found');
    };
    img.src = pngPath;
}

// Helper function to download image from URL
function downloadImageFromUrl(imageSrc, filename) {
    // Use the same logic as the existing downloadImage function
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = filename || 'excalidraw-diagram.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function to show alert when trying to edit Excalidraw on mobile
function showMobileExcalidrawAlert() {
    if (typeof window.showError === 'function') {
        window.showError('Excalidraw editing is disabled on small screens for a better user experience.', 'Editing not available');
    } else {
        alert('Excalidraw editing is disabled on screens smaller than 800px.');
    }
}

// Make functions globally available
window.openExcalidrawNote = openExcalidrawNote;
window.downloadExcalidrawImage = downloadExcalidrawImage;
window.insertExcalidrawDiagram = insertExcalidrawDiagram;
window.showMobileExcalidrawAlert = showMobileExcalidrawAlert;
window.openExcalidrawEditor = openExcalidrawEditor;
