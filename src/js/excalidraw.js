// Excalidraw integration for Poznote
// Handles creation and opening of Excalidraw diagram notes

// Create a new Excalidraw note
function createExcalidrawNote() {
    var params = new URLSearchParams({
        workspace: selectedWorkspace || 'Poznote',
        folder: selectedFolder || 'Default'
    });
    
    // Redirect to Excalidraw editor
    window.location.href = 'excalidraw_editor.php?' + params.toString();
}

// Open existing Excalidraw note for editing
function openExcalidrawNote(noteId) {
    var params = new URLSearchParams({
        note_id: noteId,
        workspace: selectedWorkspace || 'Poznote'
    });
    
    // Redirect to Excalidraw editor
    window.location.href = 'excalidraw_editor.php?' + params.toString();
}

// Make functions globally available
window.createExcalidrawNote = createExcalidrawNote;
window.openExcalidrawNote = openExcalidrawNote;
