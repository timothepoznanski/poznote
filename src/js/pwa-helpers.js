/**
 * Shared PWA and URL protocol helpers.
 * Used by share.js, shared-page.js, and public_folder.js.
 */

function isStandalonePwaMode() {
    try {
        return !!(
            (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
            window.navigator.standalone === true
        );
    } catch (error) {
        return false;
    }
}

function shouldReuseCurrentPwaWindow(targetUrl) {
    if (!isStandalonePwaMode() || !targetUrl) {
        return false;
    }

    try {
        var resolvedUrl = new URL(String(targetUrl), window.location.href);
        return resolvedUrl.host === window.location.host;
    } catch (error) {
        return false;
    }
}

function openUrlWithPwaAwareness(targetUrl) {
    if (!targetUrl) {
        return;
    }

    if (shouldReuseCurrentPwaWindow(targetUrl)) {
        window.location.href = targetUrl;
        return;
    }

    var popup = window.open(targetUrl, '_blank', 'noopener');
    if (!popup) {
        window.location.href = targetUrl;
    }
}

function bindPwaAwareLink(linkElement, targetUrl) {
    if (!linkElement || !targetUrl) {
        return;
    }

    if (!shouldReuseCurrentPwaWindow(targetUrl)) {
        linkElement.target = '_blank';
        linkElement.rel = 'noopener';
        return;
    }

    linkElement.removeAttribute('target');
    linkElement.removeAttribute('rel');
    linkElement.addEventListener('click', function(event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }

        event.preventDefault();
        window.location.href = targetUrl;
    });
}

function bindPwaAwarePublicLink(link) {
    if (!link || !shouldReuseCurrentPwaWindow(link.href)) {
        return;
    }

    link.removeAttribute('target');
    link.removeAttribute('rel');
    link.addEventListener('click', function(event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }

        event.preventDefault();
        window.location.href = link.href;
    });
}

/**
 * Get the user's preferred protocol (http or https) for public URLs
 * @returns {string} 'http' or 'https' (default: 'https')
 */
function getPreferredPublicUrlProtocol() {
    try {
        var protocol = localStorage.getItem('poznote-public-url-protocol');
        if (protocol === 'http' || protocol === 'https') {
            return protocol;
        }
    } catch (error) {
        // Ignore storage errors
    }
    return 'https';
}

/**
 * Set the user's preferred protocol for public URLs
 * @param {string} protocol - Either 'http' or 'https'
 */
function setPreferredPublicUrlProtocol(protocol) {
    try {
        if (protocol === 'http' || protocol === 'https') {
            localStorage.setItem('poznote-public-url-protocol', protocol);
        }
    } catch (error) {
        // Ignore storage errors
    }
}

/**
 * Apply a protocol to a public URL
 * @param {string} url - The URL to modify
 * @param {string} protocol - Either 'http' or 'https'
 * @returns {string} The URL with the specified protocol
 */
function applyProtocolToPublicUrl(url, protocol) {
    if (!url) return url;
    if (protocol !== 'http' && protocol !== 'https') return url;

    // Replace existing protocol
    if (/^https?:\/\//i.test(url)) {
        return protocol + '://' + url.replace(/^https?:\/\//i, '');
    }
    // Add protocol if URL starts with //
    if (/^\/\//.test(url)) {
        return protocol + ':' + url;
    }
    return url;
}
