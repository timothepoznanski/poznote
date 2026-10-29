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

            // Two-factor step: the one field accepts an authenticator code or a
            // recovery code. The link swaps the wording and, on a phone, the
            // numeric keypad for the full keyboard a recovery code needs.
            var totpToggle = document.getElementById('totp-recovery-toggle');
            var totpInput = document.getElementById('totp_code');
            var totpIntro = document.getElementById('totp-intro');

            if (totpToggle && totpInput) {
                var recoveryMode = false;
                totpToggle.addEventListener('click', function (e) {
                    e.preventDefault();
                    recoveryMode = !recoveryMode;
                    var mode = recoveryMode ? 'recovery' : 'code';
                    totpInput.setAttribute('inputmode', recoveryMode ? 'text' : 'numeric');
                    totpInput.setAttribute('autocomplete', recoveryMode ? 'off' : 'one-time-code');
                    totpInput.placeholder = totpInput.getAttribute('data-' + mode + '-placeholder') || '';
                    totpToggle.textContent = totpToggle.getAttribute('data-' + mode + '-text') || '';
                    if (totpIntro) {
                        totpIntro.textContent = totpIntro.getAttribute('data-' + mode + '-text') || '';
                    }
                    totpInput.value = '';
                    totpInput.focus();
                });
            }

            // Two-factor setup required by the administrator: the QR code is
            // drawn here with the vendored qrcode-generator, the key typed by
            // hand stays available under it if that fails.
            var enrollQr = document.getElementById('totp-enroll-qr');
            if (enrollQr && typeof window.qrcode === 'function') {
                try {
                    var qr = window.qrcode(0, 'M');
                    qr.addData(enrollQr.getAttribute('data-otpauth-uri') || '');
                    qr.make();
                    enrollQr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
                    enrollQr.hidden = false;
                } catch (qrError) {
                    console.debug('login-page: QR code not drawn:', qrError);
                }
            }

            // Copy buttons of the setup key and the recovery codes. Without the
            // clipboard API (plain http) the value is selected for a manual copy.
            Array.prototype.forEach.call(document.querySelectorAll('[data-copy-value]'), function (button) {
                var label = button.textContent;
                button.addEventListener('click', function () {
                    var select = function () {
                        var target = document.getElementById(button.getAttribute('data-copy-select') || '');
                        if (!target) return;
                        var range = document.createRange();
                        range.selectNodeContents(target);
                        var selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                    };
                    if (!navigator.clipboard || !navigator.clipboard.writeText) {
                        select();
                        return;
                    }
                    navigator.clipboard.writeText(button.getAttribute('data-copy-value') || '').then(function () {
                        button.textContent = button.getAttribute('data-copied-text') || label;
                        setTimeout(function () { button.textContent = label; }, 2000);
                    }, select);
                });
            });

            var recoveryDownload = document.getElementById('totp-recovery-download');
            if (recoveryDownload) {
                recoveryDownload.addEventListener('click', function () {
                    var blob = new Blob([(recoveryDownload.getAttribute('data-download-value') || '') + '\n'], { type: 'text/plain' });
                    var url = URL.createObjectURL(blob);
                    var link = document.createElement('a');
                    link.href = url;
                    link.download = 'poznote-recovery-codes.txt';
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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
                    console.debug('login-page: dropAutofocus() failed:', storageError);
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
                    // The remembered account's label and the "sign in with another
                    // account" button are set by the inline script in login.php,
                    // before the first paint
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
            console.debug('login-page: startOidcLogin() failed:', e);
        }
    });
})();
