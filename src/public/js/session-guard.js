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
    // page gate does for a browser too old to send Fetch Metadata.
    function inspect(requestUrl, status, finalUrl) {
        if (redirecting || !isSameOrigin(requestUrl) || isLoginPage(requestUrl)) {
            return;
        }
        if (status === 401 || (finalUrl && isLoginPage(finalUrl))) {
            confirmSessionGone();
        }
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
            return nativeFetch.apply(window, arguments).then(function (response) {
                try {
                    inspect(requestUrl, response.status, response.redirected ? response.url : '');
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
                        inspect(this.__poznoteSessionGuardUrl, this.status, this.responseURL || '');
                    } catch (e) {
                        console.debug('session-guard: XHR inspection failed:', e);
                    }
                });
            }
            return nativeOpen.apply(this, arguments);
        };
    }
})();
