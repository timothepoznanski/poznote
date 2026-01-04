/**
 * Workspace redirect - handles workspace selection after authentication
 * Used by login.php, oidc_callback.php for CSP-compliant redirects after authentication
 * Note: last_opened_workspace is now stored in database, not localStorage
 */
(function() {
    'use strict';
    
    // Get config from JSON data element
    var dataElement = document.getElementById('workspace-redirect-data');
    if (!dataElement) return;
    
    try {
        var config = JSON.parse(dataElement.textContent);
        var redirectAfter = config.redirectAfter || null;
        
        // If a specific redirect URL is provided (from OIDC flow), use it
        if (redirectAfter && typeof redirectAfter === 'string' && redirectAfter !== '') {
            window.location.href = redirectAfter;
        } else {
            // Redirect to index without workspace parameter - server will handle
            // workspace selection based on database settings (last_opened_workspace, default_workspace)
            window.location.href = 'index.php';
        }
    } catch (e) {
        // Final fallback - redirect to index without workspace
        window.location.href = 'index.php';
    }
})();
