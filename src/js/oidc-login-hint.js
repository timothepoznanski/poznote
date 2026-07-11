/**
 * OIDC login hint storage
 * Used by oidc_callback.php after a successful SSO login: remembers the account
 * email on this device so the next SSO login can send it as login_hint and the
 * identity provider skips its account chooser.
 */
(function () {
    'use strict';

    try {
        var dataElement = document.getElementById('oidc-login-hint-data');
        if (!dataElement) return;

        var data = JSON.parse(dataElement.textContent || '{}');
        if (data.email && typeof data.email === 'string') {
            localStorage.setItem('poznote_oidc_login_hint', data.email);
        }
    } catch (e) {
        // localStorage unavailable or parse error - login hint is best-effort only
    }
})();
