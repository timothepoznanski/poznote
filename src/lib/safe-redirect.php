<?php
/**
 * Where may a redirect send the browser? Only somewhere inside this app.
 *
 * The login flow carries a "come back here afterwards" target through the
 * query string, a hidden form field and the session, then hands it to the
 * browser (js/workspace-redirect.js or a Location header). Anyone can craft
 * that target in a link, so it is only safe if the browser is certain to
 * resolve it against this origin.
 *
 * Looking for "scheme://" and a leading "//" is not enough, because the
 * browser's URL parser is more generous than that (GHSA-97jp-22c4-24px):
 *
 *  - a scheme needs no slashes: "javascript:alert(1)" runs script in the app's
 *    origin, and "https:evil.example" leaves an http page for that host;
 *  - a backslash is a slash in an http(s) URL: "/\evil.example" and
 *    "\/\/evil.example" are both "//evil.example", another host;
 *  - tab, CR and LF are deleted before parsing: "/<tab>/evil.example" and
 *    "java<tab>script:" become the two cases above.
 *
 * So the rules below follow the parser instead of a list of known payloads:
 * no control character anywhere, no backslash and no "//" at the start of the
 * path, and no colon before the first slash (which is the only place a scheme
 * can be). What is left is a path, a query or a fragment of this origin.
 */

/** Longer than any page address the app produces, short enough for a header. */
const POZNOTE_REDIRECT_MAX_LENGTH = 2048;

/**
 * Returns the target unchanged when the browser will resolve it inside this
 * origin, null otherwise. Callers fall back to their own default on null.
 *
 * @param mixed $redirect Untrusted: a request parameter, REQUEST_URI, or a
 *                        value read back from the session.
 */
function poznoteSanitizeLocalRedirect($redirect): ?string {
    if (!is_string($redirect)) {
        return null;
    }

    $redirect = trim($redirect);
    if ($redirect === '' || strlen($redirect) > POZNOTE_REDIRECT_MAX_LENGTH) {
        return null;
    }

    // The browser drops tab, CR and LF wherever they are and ignores the other
    // control characters at both ends, so none of them may help spell a target.
    if (preg_match('/[\x00-\x1F\x7F]/', $redirect)) {
        return null;
    }

    // Scheme and host are decided before the query and the fragment start.
    $path = substr($redirect, 0, strcspn($redirect, '?#'));

    // In the path a backslash is read as a slash, so it is never legitimate
    // there: the browser would already have turned it into "/" when it sent
    // the address this target was built from.
    if (strpos($path, '\\') !== false) {
        return null;
    }

    // "//host" keeps the current scheme and changes the host.
    if (str_starts_with($path, '//')) {
        return null;
    }

    // A colon in the first segment makes that segment a scheme ("javascript:",
    // "data:", "https:host"). Past the first slash a colon is only a character.
    $firstSegment = substr($path, 0, strcspn($path, '/'));
    if (strpos($firstSegment, ':') !== false) {
        return null;
    }

    return $redirect;
}
