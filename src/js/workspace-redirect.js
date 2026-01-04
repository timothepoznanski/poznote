/**
 * Workspace redirect - handles localStorage workspace selection
 * Used by login.php, oidc_callback.php for CSP-compliant redirects after authentication
 */
(function() {
    'use strict';
    
    // Get config from JSON data element
    var dataElement = document.getElementById('workspace-redirect-data');
    if (!dataElement) return;
    
    try {
        var config = JSON.parse(dataElement.textContent);
        var redirectAfter = config.redirectAfter || null;
        var defaultWorkspace = config.defaultWorkspace || config; // Support both object and string format
        var workspace = null;
        
        try {
            workspace = localStorage.getItem('poznote_selected_workspace');
        } catch (e) {
            // localStorage not available
        }
        
        // If a specific redirect URL is provided (from OIDC flow), use it
        if (redirectAfter && typeof redirectAfter === 'string' && redirectAfter !== '') {
            window.location.href = redirectAfter;
        } else if (workspace && workspace !== '') {
            window.location.href = 'index.php?workspace=' + encodeURIComponent(workspace);
        } else if (defaultWorkspace && typeof defaultWorkspace === 'string' && defaultWorkspace !== '') {
            // Use default workspace if no localStorage workspace
            window.location.href = 'index.php?workspace=' + encodeURIComponent(defaultWorkspace);
        } else {
            // Final fallback - use first available workspace or empty
            window.location.href = 'index.php?workspace=';
        }
    } catch (e) {
        // Final fallback - redirect to index without workspace
        window.location.href = 'index.php';
    }
})();
