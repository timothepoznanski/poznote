// Excalidraw integration for Poznote
// Handles creation and opening of Excalidraw diagram notes

// Open existing Excalidraw note for editing
function openExcalidrawNote(noteId) {
    var params = new URLSearchParams({
        note_id: noteId,
        workspace: selectedWorkspace || 'Poznote'
    });
    
    // Redirect to Excalidraw editor
    window.location.href = 'excalidraw_editor.php?' + params.toString();
}

// Insert Excalidraw diagram at cursor position in a note
function insertExcalidrawDiagram() {
    // Check if the current note has content
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) {
        alert('Please save the note first before adding diagrams');
        return;
    }
    
    // Get the current note content
    const noteEntry = document.getElementById('entry' + currentNoteId);
    if (!noteEntry) {
        alert('Note editor not found');
        return;
    }
    
    // Check if note is empty (no content or just whitespace/empty tags)
    const noteContent = noteEntry.innerHTML.trim();
    const hasOnlyEmptyTags = /^(<br\s*\/?>|\s|&nbsp;)*$/.test(noteContent);
    
    if (!noteContent || hasOnlyEmptyTags) {
        // Show popup message
        if (window.showNotificationPopup) {
            showNotificationPopup('Please add some content to the note before inserting an Excalidraw diagram.', 'warning');
        } else {
            alert('Please add some content to the note before inserting an Excalidraw diagram.');
        }
        return;
    }
    
    // Create a unique ID for this diagram
    const diagramId = 'excalidraw-' + Date.now();
    
    // Create simple button for the Excalidraw diagram
    const diagramHTML = `<button class="excalidraw-btn" id="${diagramId}" onclick="openExcalidrawEditor('${diagramId}')" style="cursor: pointer; background: #007DB8; color: white; border: none; padding: 8px 12px; border-radius: 4px; font-size: 14px; margin: 4px;" title="Open Excalidraw diagram editor">Click to create your Excalidraw image here</button><br><br>`;
    
    // Insert at cursor position
    insertHtmlAtCursor(diagramHTML);
    
    // Trigger automatic save to ensure placeholder is saved before opening editor
    if (typeof updateNote === 'function') {
        updateNote(); // Mark note as edited
    }
    // Then trigger immediate save after a short delay to allow DOM to update
    setTimeout(function() {
        if (typeof updatenote === 'function') {
            updatenote(); // Save to server
        }
    }, 100);
}

// Open Excalidraw editor for a specific diagram
function openExcalidrawEditor(diagramId) {
    // Store the current note context
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) {
        alert('Please save the note first before editing diagrams');
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
    if (selection.rangeCount === 0) {
        // No selection, try to find the focused editable element
        const focusedElement = document.querySelector('.note-content[contenteditable="true"]:focus') || 
                              document.querySelector('.note-content[contenteditable="true"]');
        if (focusedElement) {
            focusedElement.focus();
            selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(focusedElement);
            range.collapse(false); // Move to end
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
    
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const fragment = range.createContextualFragment(html);
        range.deleteContents();
        range.insertNode(fragment);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        if (window.showNotificationPopup) {
            showNotificationPopup('Please place cursor in the note content area first', 'warning');
        } else {
            alert('Please place cursor in the note content area first');
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
        alert('Excalidraw image not found. Please open the diagram in the editor and save it first.');
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

// Make functions globally available
window.openExcalidrawNote = openExcalidrawNote;
window.downloadExcalidrawImage = downloadExcalidrawImage;
window.insertExcalidrawDiagram = insertExcalidrawDiagram;
window.openExcalidrawEditor = openExcalidrawEditor;
