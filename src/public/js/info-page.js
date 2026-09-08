// JavaScript for note info page
// Requires: navigation.js (for goBackToNote)

// Get data from body attributes
function getPageData() {
    var body = document.body;
    return {
        noteId: body.getAttribute('data-note-id') || '',
        workspace: body.getAttribute('data-workspace') || ''
    };
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', function() {
    var data = getPageData();
    
    // Back to note button
    var backBtn = document.getElementById('backToNoteBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            goBackToNote(data.noteId);
        });
    }
});
