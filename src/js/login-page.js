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

            // Unified "Remember Me" handling for both standard and OIDC login
            var rememberMeCheckbox = document.getElementById('remember_me');
            
            // Standard login form: sync checkbox with hidden input
            var loginForm = document.querySelector('form[method="POST"]');
            var rememberMeHidden = document.getElementById('remember_me_hidden');
            
            if (loginForm && rememberMeCheckbox && rememberMeHidden) {
                loginForm.addEventListener('submit', function() {
                    rememberMeHidden.value = rememberMeCheckbox.checked ? '1' : '0';
                });
            }
            
            // OIDC login: redirect with remember_me parameter
            if (config.oidcEnabled && rememberMeCheckbox) {
                var oidcLoginBtn = document.getElementById('oidc-login-btn');
                
                if (oidcLoginBtn) {
                    oidcLoginBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        var rememberMe = rememberMeCheckbox.checked ? '1' : '0';
                        window.location.href = 'oidc_login.php?remember_me=' + rememberMe;
                    });
                }
            }

            // Note: last_opened_workspace is now stored in database, no localStorage cleanup needed
        } catch (e) {
            // Ignore parse errors
        }
    });
})();
