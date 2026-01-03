/**
 * Export attachments page JavaScript
 * CSP-compliant: Updates "Back to Notes" link with stored workspace
 */
(function() {
    'use strict';
    
    try {
        var stored = localStorage.getItem('poznote_selected_workspace');
        if (stored) {
            var backLink = document.getElementById('backToNotesLink');
            if (backLink) {
                backLink.setAttribute('href', 'index.php?workspace=' + encodeURIComponent(stored));
            }
        }
    } catch (e) {
        // localStorage not available
    }
})();
