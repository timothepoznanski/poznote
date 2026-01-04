/**
 * Export attachments page JavaScript
 * CSP-compliant: Updates "Back to Notes" link with current workspace from PHP
 */
(function() {
    'use strict';
    
    try {
        // Use workspace from PHP (set as global variable)
        var workspace = (typeof selectedWorkspace !== 'undefined' && selectedWorkspace) ? selectedWorkspace : 
                        (typeof window.selectedWorkspace !== 'undefined' && window.selectedWorkspace) ? window.selectedWorkspace : null;
        if (workspace) {
            var backLink = document.getElementById('backToNotesLink');
            if (backLink) {
                backLink.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(workspace));
            }
        }
    } catch (e) {
        // Error reading workspace
    }
})();
