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
            
            // Note: last_opened_workspace is now stored in database, no localStorage cleanup needed
        } catch (e) {
            // Ignore parse errors
        }
    });
})();
