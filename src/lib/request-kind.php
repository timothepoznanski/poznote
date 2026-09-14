<?php
/**
 * Who is asking? Classifying a request that carries no usable credential.
 *
 * The API answers a missing credential with 401 and a Basic challenge, so that
 * HTTP clients which wait for one before sending theirs (Java's HttpClient,
 * .NET, some CLI tools) can authenticate. A browser honours the very same
 * challenge with its native username/password dialog, and inside the web app
 * that dialog is exactly wrong: it opens over the page as soon as a background
 * call (the live-refresh poller, an autosave) meets a dead session, it cannot
 * sign an SSO account in at all, and it hides the login page that could
 * (issue #1389).
 *
 * This module tells the two apart from the request headers alone, so the
 * challenge can be withheld from the app's own calls. Those get either a bare
 * 401 (a script call, and the page then sends itself to the login form, see
 * js/session-guard.js) or a redirect to the login page (a navigation, and the
 * login form sends the browser back afterwards).
 *
 * Detection relies on the Fetch Metadata headers every current browser sends
 * (Sec-Fetch-Mode, Sec-Fetch-Dest) and on the X-Requested-With marker the
 * app's own calls set. Non-browser clients send neither, so nothing changes
 * for them. Browsers too old for Fetch Metadata are told apart by their
 * Accept header on a navigation, and keep the challenge everywhere else,
 * which is what they had before.
 */

/** A top-level navigation: the address bar, a link, a form, a reload. */
const POZNOTE_REQUEST_DOCUMENT = 'document';

/** A navigation inside a frame (iframe, embed, object). */
const POZNOTE_REQUEST_FRAME = 'frame';

/** A call made by a page's script (fetch, XMLHttpRequest) or a subresource. */
const POZNOTE_REQUEST_SCRIPT = 'script';

/** No browser signal at all: an API client, a CLI, a health check. */
const POZNOTE_REQUEST_CLIENT = 'client';

/**
 * Classifies the caller from a $_SERVER-shaped array.
 *
 * @param array $server Typically $_SERVER.
 * @return string One of the POZNOTE_REQUEST_* constants.
 */
function poznoteClassifyRequest(array $server): string
{
    $mode = strtolower(trim((string)($server['HTTP_SEC_FETCH_MODE'] ?? '')));
    $dest = strtolower(trim((string)($server['HTTP_SEC_FETCH_DEST'] ?? '')));

    if ($mode !== '') {
        if ($mode !== 'navigate') {
            return POZNOTE_REQUEST_SCRIPT;
        }
        return in_array($dest, ['iframe', 'frame', 'embed', 'object'], true)
            ? POZNOTE_REQUEST_FRAME
            : POZNOTE_REQUEST_DOCUMENT;
    }

    if (strcasecmp(trim((string)($server['HTTP_X_REQUESTED_WITH'] ?? '')), 'XMLHttpRequest') === 0) {
        return POZNOTE_REQUEST_SCRIPT;
    }

    // No Fetch Metadata: an older browser, or not a browser. Only a page
    // navigation asks for HTML, and no API client does.
    if (stripos((string)($server['HTTP_ACCEPT'] ?? ''), 'text/html') !== false) {
        return POZNOTE_REQUEST_DOCUMENT;
    }

    return POZNOTE_REQUEST_CLIENT;
}

/**
 * True when the caller is the web app itself (a page or its scripts), in
 * which case a Basic challenge would surface as the browser's own dialog.
 */
function poznoteRequestIsFromBrowser(array $server): bool
{
    return poznoteClassifyRequest($server) !== POZNOTE_REQUEST_CLIENT;
}
