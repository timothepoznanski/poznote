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

            var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                || window.navigator.standalone === true;

            // Auto-focus OIDC button if configured
            if (config.focusOidc) {
                var oidcButton = document.querySelector('.oidc-button');
                if (oidcButton) {
                    oidcButton.focus();
                }
            }

            // In the installed PWA, drop the autofocus on the username input:
            // it opens the on-screen keyboard over the SSO button. The browser
            // flushes autofocus around the load event (after DOMContentLoaded),
            // so re-check then.
            if (isStandalone) {
                var usernameField = document.getElementById('username');
                if (usernameField) {
                    usernameField.removeAttribute('autofocus');
                    var dropAutofocus = function () {
                        if (document.activeElement === usernameField) {
                            usernameField.blur();
                        }
                    };
                    dropAutofocus();
                    window.addEventListener('load', function () {
                        dropAutofocus();
                        setTimeout(dropAutofocus, 0);
                    });
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
                var oidcOtherAccountBtn = document.getElementById('oidc-other-account-btn');

                // Email of the last SSO login on this device (stored by
                // oidc-login-hint.js after a successful SSO login)
                var loginHint = null;
                try {
                    loginHint = localStorage.getItem('poznote_oidc_login_hint');
                } catch (storageError) {
                    // localStorage unavailable - hint is best-effort only
                }

                var startOidcLogin = function (options) {
                    var params = new URLSearchParams();
                    if (config.redirectAfter) {
                        params.set('redirect', config.redirectAfter);
                    }
                    if (options && options.loginHint) {
                        // Sending the hint lets the provider skip its account chooser
                        // (which escapes the PWA Custom Tab on mobile when several
                        // accounts are signed in)
                        params.set('login_hint', options.loginHint);
                    }
                    if (options && options.selectAccount) {
                        params.set('prompt', 'select_account');
                    }
                    var query = params.toString();
                    window.location.href = 'oidc_login.php' + (query ? '?' + query : '');
                };

                if (oidcLoginBtn) {
                    // When an account is remembered, show it in the button label and
                    // reveal the "sign in with another account" alternative
                    if (loginHint && config.oidcAccountButtonTemplate) {
                        oidcLoginBtn.textContent = config.oidcAccountButtonTemplate.replace('{{account}}', loginHint);
                        if (oidcOtherAccountBtn) {
                            oidcOtherAccountBtn.hidden = false;
                        }
                    }

                    oidcLoginBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        startOidcLogin({ loginHint: loginHint });
                    });
                }

                if (oidcOtherAccountBtn) {
                    oidcOtherAccountBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        startOidcLogin({ selectAccount: true });
                    });
                }
            }

            // PWA safety net: if an SSO login escaped to the external browser
            // (session cookies are shared with the PWA on Android), detect the
            // now-existing session when the app comes back to the foreground and
            // enter the app instead of staying stuck on the login page.
            if (isStandalone) {
                var sessionCheckPending = false;

                document.addEventListener('visibilitychange', function () {
                    if (document.visibilityState !== 'visible' || sessionCheckPending) return;
                    sessionCheckPending = true;

                    fetch('login.php', { credentials: 'same-origin' })
                        .then(function (response) { return response.text(); })
                        .then(function (html) {
                            // login.php renders the workspace-redirect page instead of
                            // the login form when a session already exists
                            if (html.indexOf('workspace-redirect-data') !== -1) {
                                window.location.reload();
                            } else {
                                sessionCheckPending = false;
                            }
                        })
                        .catch(function () {
                            sessionCheckPending = false;
                        });
                });
            }

            // Note: last_opened_workspace is now stored in database, no localStorage cleanup needed
        } catch (e) {
            // Ignore parse errors
        }
    });
})();
