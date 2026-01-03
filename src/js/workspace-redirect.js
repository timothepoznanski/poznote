// Workspace redirect - handles localStorage workspace selection
(function() {
    'use strict';
    
    // Get default workspace from JSON data element
    var dataElement = document.getElementById('workspace-redirect-data');
    if (!dataElement) return;
    
    try {
        var defaultWs = JSON.parse(dataElement.textContent);
        var workspace = localStorage.getItem('poznote_selected_workspace');
        
        // Always redirect to include workspace parameter
        if (workspace && workspace !== '') {
            var params = new URLSearchParams(window.location.search);
            params.set('workspace', workspace);
            window.location.href = 'index.php?' + params.toString();
        } else {
            // No workspace in localStorage, redirect with first available workspace
            var params = new URLSearchParams(window.location.search);
            params.set('workspace', defaultWs);
            window.location.href = 'index.php?' + params.toString();
        }
    } catch (e) {
        // If localStorage fails, redirect with default workspace
        try {
            var defaultWs = JSON.parse(dataElement.textContent);
            var params = new URLSearchParams(window.location.search);
            params.set('workspace', defaultWs);
            window.location.href = 'index.php?' + params.toString();
        } catch (e2) {
            // Final fallback - do nothing, page will continue
        }
    }
})();
