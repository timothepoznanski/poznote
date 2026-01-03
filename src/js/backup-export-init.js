// JavaScript for backup export page

document.addEventListener('DOMContentLoaded', function() {
    // Update back to notes link with workspace from localStorage
    try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        if (stored) {
            var a = document.getElementById('backToNotesLink');
            if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
        }
    } catch(e) {}
    
    // Attach structured export button listener
    var structuredExportBtn = document.getElementById('structuredExportBtn');
    if (structuredExportBtn) {
        structuredExportBtn.addEventListener('click', function() {
            if (typeof startStructuredExport === 'function') {
                startStructuredExport();
            }
        });
    }
});
