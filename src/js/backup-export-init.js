// JavaScript for backup export page

document.addEventListener('DOMContentLoaded', function() {
    // Update back to notes link with workspace from PHP global
    try {
        var workspace = (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) ? selectedWorkspace : 
                        (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : null;
        if (workspace) {
            var a = document.getElementById('backToNotesLink');
            if (a) a.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(workspace));
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
