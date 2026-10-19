<?php
/**
 * Content-Disposition header values for files handed to the browser.
 *
 * A raw UTF-8 name in the quoted filename parameter is not portable: the
 * header is read as Latin-1 by some clients, so a Korean PDF opened in the
 * browser's viewer showed a garbled title (#1653). RFC 6266 sends an ASCII
 * fallback in filename and the real name, percent-encoded as UTF-8, in
 * filename*, which every current browser prefers when present.
 */

/**
 * The full header value, e.g. 'inline; filename="x.pdf"; filename*=UTF-8''...'.
 *
 * @param string $type     "inline" or "attachment"
 * @param string $filename the name as the user knows it, any characters
 * @param string $fallback base name used when nothing ASCII is left of it
 */
function poznoteContentDisposition(string $type, string $filename, string $fallback = 'download'): string {
    $type = $type === 'inline' ? 'inline' : 'attachment';

    // The name ends up in a response header: no control characters (CR/LF
    // would split it), no path, and only valid UTF-8 so filename* is honest.
    $name = mb_convert_encoding($filename, 'UTF-8', 'UTF-8');
    $name = (string)preg_replace('/[\x00-\x1F\x7F]/', '', $name);
    $name = basename(str_replace('\\', '/', $name));
    $name = trim(str_replace('"', '', $name));

    $ascii = poznoteContentDispositionAsciiName($name, $fallback);
    $value = $type . '; filename="' . $ascii . '"';

    if ($name !== '' && $name !== $ascii) {
        $value .= "; filename*=UTF-8''" . rawurlencode($name);
    }

    return $value;
}

/**
 * The ASCII stand-in for the quoted filename parameter: every run of other
 * characters becomes one "_", and a name with no letter or digit left in its
 * base takes the fallback, keeping an ASCII extension ("한글.pdf" -> "download.pdf").
 */
function poznoteContentDispositionAsciiName(string $name, string $fallback = 'download'): string {
    $ascii = (string)preg_replace('/[^\x20-\x7E]+/', '_', $name);
    // Quotes and backslashes are special inside a quoted-string
    $ascii = trim(str_replace(['"', '\\'], '', $ascii));

    $dot = strrpos($ascii, '.');
    $base = $dot === false ? $ascii : substr($ascii, 0, $dot);
    $extension = $dot === false ? '' : substr($ascii, $dot);

    if (!preg_match('/[A-Za-z0-9]/', $base)) {
        $extension = preg_match('/\A\.[A-Za-z0-9]+\z/', $extension) ? $extension : '';
        return $fallback . $extension;
    }

    return $ascii;
}
