/**
 * Login page JavaScript
 * CSP-compliant event handlers for login.php
 */
(function() {
    'use strict';
    
    document.addEventListener('DOMContentLoaded', function() {
        // Get config from JSON element
        var configElement = document.getElementById('login-config');
        if (!configElement) return;
        
        try {
            var config = JSON.parse(configElement.textContent || '{}');
            
            // Auto-focus OIDC button if configured
            if (config.focusOidc) {
                var oidcButton = document.querySelector('.oidc-button');
                if (oidcButton) {
                    oidcButton.focus();
                }
            }
            
            // Clear workspace from localStorage if configured
            if (config.clearWorkspace) {
                try {
                    localStorage.removeItem('poznote_selected_workspace');
                } catch (e) {
                    // localStorage not available
                }
            }
        } catch (e) {
            // Ignore parse errors
        }
    });
})();
