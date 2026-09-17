/**
 * Session guard: sends the page to the login form when its session is gone.
 *
 * A same-origin fetch or XMLHttpRequest answered with 401 means the session
 * behind the cookie no longer exists: neither the API nor the page gates
 * answer 401 for any other reason. That used to come with a Basic challenge,
 * and the browser opened its native username/password dialog over the app,
 * which cannot sign an SSO account in at all (issue #1389). The server now
 * withholds the challenge from the app's own calls, and this file does what
 * the dialog could not: confirm with login.php that the session is really
 * gone (a 401 from any other cause must not throw the user out), then go to
 * login.php with the current URL as the place to come back to.
 *
 * Second duty, same wrappers: a tab that missed an account switch. The
 * active account is session state (switch_account.php, the login-time
 * account choice), so after a switch made in another tab, or when this page
 * comes back from the back-forward cache, every call this page makes would
 * act on the new account with the ids of the old one. The server mirrors
 * the active account in the poznote_account cookie (auth.php
 * syncActiveAccountCookie()); this file remembers the value its page was
 * rendered with, sends it as X-Poznote-Account on every same-origin call so
 * the server can refuse a mismatch with 409 (enforceActiveAccountHeader()),
 * and reloads the page, without its query string, as soon as the cookie no
 * longer matches: on that 409, when the tab is shown or focused again, and on
 * a back-forward cache restore.
 *
 * Loaded standalone in <head> on every signed-in page, before any script
 * that talks to the server. Not loaded on login.php or on public pages.
 */
(function () {
    'use strict';

    if (typeof window === 'undefined' || !window.location) {
        return;
    }

    var nativeFetch = typeof window.fetch === 'function' ? window.fetch : null;
    var redirecting = false;
    var checking = false;

    // login.php lives next to js/: resolving it from this script's own URL
    // works from the docroot, from admin/ and from an instance served under a
    // path prefix alike.
    var loginUrl = (function () {
        try {
            var script = document.currentScript;
            var src = script && script.src ? script.src : '';
            var marker = src.lastIndexOf('/js/');
            if (marker !== -1) {
                return src.slice(0, marker + 1) + 'login.php';
            }
        } catch (e) {
            console.debug('session-guard: script URL unavailable:', e);
        }
        return '/login.php';
    })();

    // ========== Account of this page ==========

    function readAccountCookie() {
        try {
            var match = document.cookie.match(/(?:^|;\s*)poznote_account=(\d+)/);
            return match ? match[1] : '';
        } catch (e) {
            return '';
        }
    }

    // The cookie was set by the response that rendered this page, so at this
    // point it names the account the page shows.
    var pageAccount = readAccountCookie();
    var reloadingForAccount = false;

    // The query string belongs to the old account (a note id, a workspace):
    // the same path without it opens the new account where it left off.
    function reloadForAccountSwitch() {
        if (reloadingForAccount || redirecting) {
            return;
        }
        reloadingForAccount = true;
        window.location.replace(window.location.pathname);
    }

    // This page is the one switching (js/profile.js): its last calls may
    // reach the server after the switch and come back 409, and reloading
    // then would cancel the navigation into the other account, landing note
    // included.
    // Not for ever: the person may decline to leave (unsaved changes prompt).
    window.poznoteAccountSwitchStarted = function () {
        reloadingForAccount = true;
        setTimeout(function () { reloadingForAccount = false; }, 10000);
    };

    function checkAccountCookie() {
        if (!pageAccount) {
            return;
        }
        var current = readAccountCookie();
        if (current && current !== pageAccount) {
            reloadForAccountSwitch();
        }
    }

    window.addEventListener('pageshow', function (e) {
        if (e && e.persisted) {
            reloadingForAccount = false;
            checkAccountCookie();
        }
    });
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') checkAccountCookie();
    });
    window.addEventListener('focus', checkAccountCookie);

    function resolve(url) {
        try {
            return new URL(String(url), window.location.href);
        } catch (e) {
            return null;
        }
    }

    function isSameOrigin(url) {
        var parsed = resolve(url);
        return !!parsed && parsed.origin === window.location.origin;
    }

    function isLoginPage(url) {
        var parsed = resolve(url);
        return !!parsed && /(^|\/)login\.php$/.test(parsed.pathname);
    }

    function goToLogin() {
        if (redirecting) {
            return;
        }
        redirecting = true;
        var here = window.location.pathname + window.location.search + window.location.hash;
        window.location.replace(loginUrl + '?expired=1&redirect=' + encodeURIComponent(here));
    }

    // login.php renders the workspace-redirect stub, not the form, when a
    // session exists (the same probe login-page.js uses for the PWA).
    function confirmSessionGone() {
        if (checking || redirecting || !nativeFetch) {
            return;
        }
        checking = true;
        nativeFetch(loginUrl, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        }).then(function (response) {
            return response.text();
        }).then(function (html) {
            checking = false;
            if (html.indexOf('workspace-redirect-data') === -1) {
                goToLogin();
            }
        }).catch(function (e) {
            checking = false;
            console.debug('session-guard: session probe failed:', e);
        });
    }

    // A 401 is the signal; so is being bounced to login.php, which is what a
    // page gate does for a browser too old to send Fetch Metadata. A 409
    // carrying the account_switched marker is the server refusing a call
    // from this page because the session moved to another account.
    function inspect(requestUrl, status, finalUrl, bodyText) {
        if (redirecting || !isSameOrigin(requestUrl) || isLoginPage(requestUrl)) {
            return;
        }
        if (status === 409 && typeof bodyText === 'string' && bodyText.indexOf('account_switched') !== -1) {
            reloadForAccountSwitch();
            return;
        }
        if (status === 401 || (finalUrl && isLoginPage(finalUrl))) {
            confirmSessionGone();
        }
    }

    // Same-origin calls carry the page's account; a custom header on a
    // cross-origin call would only force a preflight.
    function withAccountHeader(input, init) {
        if (!pageAccount) {
            return null;
        }
        var request;
        try {
            request = new Request(input, init);
        } catch (e) {
            return null;
        }
        if (!isSameOrigin(request.url) || request.headers.has('X-Poznote-Account')) {
            return null;
        }
        // A no-cors request only accepts safelisted headers and throws here:
        // it then goes out untagged rather than failing.
        try {
            request.headers.set('X-Poznote-Account', pageAccount);
        } catch (e) {
            return null;
        }
        return request;
    }

    if (nativeFetch) {
        window.fetch = function (input, init) {
            var requestUrl = '';
            if (typeof input === 'string') {
                requestUrl = input;
            } else if (input && typeof input.url === 'string') {
                requestUrl = input.url;
            } else if (input && typeof input.href === 'string') {
                requestUrl = input.href;
            }
            var tagged = withAccountHeader(input, init);
            var call = tagged ? nativeFetch.call(window, tagged) : nativeFetch.apply(window, arguments);
            return call.then(function (response) {
                try {
                    if (response.status === 409 && isSameOrigin(requestUrl)) {
                        response.clone().text().then(function (text) {
                            inspect(requestUrl, response.status, '', text);
                        }).catch(function () { /* not a switch */ });
                    } else {
                        inspect(requestUrl, response.status, response.redirected ? response.url : '');
                    }
                } catch (e) {
                    console.debug('session-guard: fetch inspection failed:', e);
                }
                return response;
            });
        };
    }

    var xhrProto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (xhrProto && typeof xhrProto.open === 'function') {
        var nativeOpen = xhrProto.open;
        xhrProto.open = function (method, url) {
            this.__poznoteSessionGuardUrl = String(url);
            if (!this.__poznoteSessionGuardHooked) {
                this.__poznoteSessionGuardHooked = true;
                this.addEventListener('load', function () {
                    try {
                        var body = '';
                        if (this.status === 409 && (this.responseType === '' || this.responseType === 'text')) {
                            body = String(this.responseText || '');
                        }
                        inspect(this.__poznoteSessionGuardUrl, this.status, this.responseURL || '', body);
                    } catch (e) {
                        console.debug('session-guard: XHR inspection failed:', e);
                    }
                });
            }
            return nativeOpen.apply(this, arguments);
        };

        var nativeSend = xhrProto.send;
        if (typeof nativeSend === 'function') {
            xhrProto.send = function () {
                try {
                    if (pageAccount && this.__poznoteSessionGuardUrl && isSameOrigin(this.__poznoteSessionGuardUrl)) {
                        this.setRequestHeader('X-Poznote-Account', pageAccount);
                    }
                } catch (e) {
                    console.debug('session-guard: XHR account header failed:', e);
                }
                return nativeSend.apply(this, arguments);
            };
        }
    }
})();
