/**
 * workspace-navigation.js
 * Common workspace and navigation utilities
 */

// Ensure "Back to Notes" links use the stored workspace
(function() {
    function updateBackToNotesLink() {
        try {
            var stored = localStorage.getItem('poznote_selected_workspace');
            if (stored) {
                var links = document.querySelectorAll('#backToNotesLink, .back-to-notes-link');
                links.forEach(function(link) {
                    if (link) {
                        var currentHref = link.getAttribute('href') || 'index.php';
                        var url = new URL(currentHref, window.location.origin);
                        url.searchParams.set('workspace', stored);
                        link.setAttribute('href', url.pathname + url.search);
                    }
                });
            }
        } catch(e) {
            console.error('Error updating back to notes link:', e);
        }
    }
    
    // Update on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateBackToNotesLink);
    } else {
        updateBackToNotesLink();
    }
    
    // Export for programmatic use
    window.updateBackToNotesLink = updateBackToNotesLink;
})();
