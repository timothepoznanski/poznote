// Excalidraw integration for Poznote
// Handles creation and opening of Excalidrax diagram notes

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

// Download Excalidrax diagram as PNG image
function downloadExcalidrawImage(noteId) {
    // Get the PNG file path for this note
    const pngPath = `data/entries/${noteId}.png`;
    
    // Check if PNG exists by trying to load it
    const img = new Image();
    img.onload = function() {
        // PNG exists, download it
        downloadImageFromUrl(pngPath, `excalidrax-diagram-${noteId}.png`);
    };
    img.onerror = function() {
        // PNG doesn't exist, show error message
        console.error('Excalidraw PNG not found for note ' + noteId);
        alert('Excalidrax image not found. Please open the diagram in the editor and save it first.');
    };
    img.src = pngPath;
}

// Helper function to download image from URL
function downloadImageFromUrl(imageSrc, filename) {
    // Use the same logic as the existing downloadImage function
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = filename || 'excalidrax-diagram.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Make functions globally available
window.createExcalidrawNote = createExcalidrawNote;
window.openExcalidrawNote = openExcalidrawNote;
window.downloadExcalidrawImage = downloadExcalidrawImage;
