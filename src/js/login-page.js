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
                        icon.classList.toggle('lucide-eye');
                        icon.classList.toggle('lucide-eye-off');
                    }

                    // Toggle title
                    this.title = type === 'password' ? config.showPasswordTitle : config.hidePasswordTitle;
                });
            }

            // OIDC login: redirect without creating a Poznote remember-me cookie.
            if (config.oidcEnabled) {
                var oidcLoginBtn = document.getElementById('oidc-login-btn');
                
                if (oidcLoginBtn) {
                    oidcLoginBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        var params = new URLSearchParams();
                        if (config.redirectAfter) {
                            params.set('redirect', config.redirectAfter);
                        }
                        var query = params.toString();
                        window.location.href = 'oidc_login.php' + (query ? '?' + query : '');
                    });
                }
            }

            // Note: last_opened_workspace is now stored in database, no localStorage cleanup needed
        } catch (e) {
            // Ignore parse errors
        }
    });
})();
