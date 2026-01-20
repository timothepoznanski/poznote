/**
 * Login page JavaScript
 * CSP-compliant event handlers for login.php
 */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
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

            // Password visibility toggle
            var togglePassword = document.getElementById('togglePassword');
            var passwordField = document.getElementById('password');

            if (togglePassword && passwordField) {
                togglePassword.addEventListener('click', function () {
                    var type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
                    passwordField.setAttribute('type', type);

                    // Toggle icon
                    var icon = this.querySelector('i');
                    if (icon) {
                        icon.classList.toggle('fa-eye');
                        icon.classList.toggle('fa-eye-slash');
                    }

                    // Toggle title
                    this.title = type === 'password' ? config.showPasswordTitle : config.hidePasswordTitle;
                });
            }

            // Note: last_opened_workspace is now stored in database, no localStorage cleanup needed
        } catch (e) {
            // Ignore parse errors
        }
    });
})();
