/**
 * Offline sign-in, the login page side (login.php).
 *
 *  - When the password form is sent, the password is turned into a verifier
 *    (salted PBKDF2, js/offline-store.js) parked in this tab. The first page
 *    of the app files it under the account that signed in
 *    (js/offline-sync.js), and the offline page checks a password against
 *    it when Poznote is opened without a network. The password itself is
 *    never stored.
 *  - Right after a sign-out, what this device kept for the account that
 *    signed out is forgotten (changes still waiting to be sent excepted).
 */
(function () {
    'use strict';

    var Store = window.PoznoteOffline;
    if (!Store || !Store.isSupported()) {
        return;
    }

    var config = {};
    try {
        var configElement = document.getElementById('login-config');
        config = JSON.parse((configElement && configElement.textContent) || '{}');
    } catch (e) {
        config = {};
    }

    if (config.justLoggedOut) {
        Store.getMeta('current').then(function (current) {
            if (!current || !current.userId) {
                return null;
            }
            return Store.forgetAccount(current.userId).then(function () {
                return Store.deleteMeta('current');
            });
        }).catch(function (e) {
            console.debug('offline-login: forgetting the offline copies failed:', e);
        });
    }

    // Only the two-factor step follows an accepted password on this page;
    // any other render means the last attempt did not sign in.
    if (!document.querySelector('.totp-challenge-form')) {
        Store.clearPendingVerifier();
    }

    var form = document.querySelector('form.password-login-form');
    if (!form) {
        return;
    }

    var sending = false;
    form.addEventListener('submit', function (event) {
        if (sending) {
            return;
        }
        var usernameField = form.querySelector('#username');
        var passwordField = form.querySelector('#password');
        if (!usernameField || !passwordField || !passwordField.value) {
            return;
        }

        event.preventDefault();
        var login = usernameField.value;
        var send = function () {
            if (sending) {
                return;
            }
            sending = true;
            HTMLFormElement.prototype.submit.call(form);
        };
        // Signing in never waits on this for long.
        var timer = setTimeout(send, 4000);
        Store.createVerifier(passwordField.value)
            .then(function (verifier) {
                Store.storePendingVerifier(login, verifier);
            })
            .catch(function (e) {
                console.debug('offline-login: createVerifier() failed:', e);
            })
            .then(function () {
                clearTimeout(timer);
                send();
            });
    });
})();
