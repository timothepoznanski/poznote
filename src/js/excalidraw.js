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
    // Check if cursor is in editable note first
    if (!isCursorInEditableNote()) {
        showCursorWarning();
        return;
    }
    
    // Check if the current note has content
    const currentNoteId = getCurrentNoteId();
    if (!currentNoteId) {
        window.showError('Veuillez sauvegarder la note avant d\'ajouter des diagrammes', 'Note non sauvegardée');
        return;
    }
    
    // Get the current note content
    const noteEntry = document.getElementById('entry' + currentNoteId);
    if (!noteEntry) {
        window.showError('Éditeur de note non trouvé', 'Erreur');
        return;
    }
    
    // Check if note is empty (no content or just whitespace/empty tags)
    // COMMENTED OUT: Allow creating Excalidraw diagrams in empty notes
    /*
    const noteContent = noteEntry.innerHTML.trim();
    const hasOnlyEmptyTags = /^(<br\s*\/?>|\s|&nbsp;)*$/.test(noteContent);
    
    if (!noteContent || hasOnlyEmptyTags) {
        // Show popup message
        if (window.showNotificationPopup) {
            showNotificationPopup('Please add some content to the note before inserting an Excalidraw diagram.', 'warning');
        } else {
            window.showWarning('Veuillez ajouter du contenu à la note avant d\'insérer un diagramme Excalidraw.');
        }
        return;
    }
    */
    
    // Create a unique ID for this diagram
    const diagramId = 'excalidraw-' + Date.now();
    
    // Create simple button for the Excalidraw diagram
    const diagramHTML = `<button class="excalidraw-btn" id="${diagramId}" onclick="openExcalidrawEditor('${diagramId}')" style="cursor: pointer; background: #007DB8; color: white; border: none; padding: 8px 12px; border-radius: 4px; font-size: 14px; margin: 4px;" title="Open Excalidraw diagram editor">Click here to create your Excalidraw image here</button><br><br>`;
    
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
        window.showError('Veuillez sauvegarder la note avant d\'éditer les diagrammes', 'Note non sauvegardée');
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
            window.showError('Impossible de trouver la zone de contenu de la note pour insérer le diagramme', 'Erreur d\'insertion');
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
        window.showError('Image Excalidraw non trouvée. Veuillez ouvrir le diagramme dans l\'éditeur et le sauvegarder d\'abord.', 'Image introuvable');
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
