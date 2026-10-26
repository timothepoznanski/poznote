<?php
/**
 * The instance logo: Poznote's own, or the one an administrator uploaded
 * (discussion #1336).
 *
 * A custom logo is two square PNG files in data/branding/, drawn in the
 * browser from whatever image the admin picked (the image has neither GD nor
 * Imagick to resize on this side). nginx serves them as they are, without
 * signing in: the login page and the installed app's icon need them first.
 *
 * Only the logo changes. The name stays: it is what someone answers when asked
 * what the app is, so the installed app keeps "Poznote" under its icon
 * (pwa/manifest.php) and the login page says it is powered by Poznote.
 *
 * Pure: no database, no session, so offline.php and pwa/manifest.php can load
 * it without the rest of the app.
 */

/** The sizes stored, each one a square PNG: 512 for the pages, 192 for the app icon. */
const POZNOTE_LOGO_SIZES = [512, 192];

/** A logo drawn at 512 px weighs a few hundred KB at worst. */
const POZNOTE_LOGO_MAX_BYTES = 2 * 1024 * 1024;

function poznoteBrandingDir(): string {
    // The tests point it at a directory of their own.
    return defined('POZNOTE_BRANDING_DIR') ? (string)POZNOTE_BRANDING_DIR : dirname(__DIR__) . '/data/branding';
}

function poznoteLogoPath(int $size): string {
    return poznoteBrandingDir() . '/logo-' . $size . '.png';
}

/**
 * What changes when the logo is replaced, for the ?v= of its URLs (they are
 * cached for a year). '' when there is no custom logo, which is also the case
 * when one of the two files is missing: a half-written logo shows Poznote's.
 * Read once per request; $refresh after the files were written or removed.
 */
function poznoteCustomLogoVersion(bool $refresh = false): string {
    static $version = null;
    if ($version !== null && !$refresh) {
        return $version;
    }
    $version = '';
    $parts = [];
    foreach (POZNOTE_LOGO_SIZES as $size) {
        $path = poznoteLogoPath($size);
        clearstatcache(true, $path);
        if (!is_file($path)) {
            return $version;
        }
        $parts[] = dechex((int)filemtime($path)) . dechex((int)filesize($path));
    }
    $version = implode('-', $parts);
    return $version;
}

function poznoteHasCustomLogo(): bool {
    return poznoteCustomLogoVersion() !== '';
}

/**
 * URL of a custom logo file. $base leads from the page to the app root
 * ('' for a root page, '../' for admin/ and oauth/).
 */
function poznoteCustomLogoUrl(int $size, string $base = ''): string {
    return $base . 'data/branding/logo-' . $size . '.png?v=' . rawurlencode(poznoteCustomLogoVersion());
}

/**
 * The <link> tags of the tab icon and the iOS home screen icon. Pages without
 * them (public notes, the API docs) get the custom logo too: nginx answers the
 * browser's own /favicon.ico request with it.
 *
 * $assetVersion: the ?v= of Poznote's iOS icon, as the page already puts it
 * in its other URLs.
 */
function poznoteBrandIconTags(string $base = '', string $assetVersion = ''): string {
    $esc = static function (string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    };
    if (poznoteHasCustomLogo()) {
        return '<link rel="icon" href="' . $esc(poznoteCustomLogoUrl(512, $base)) . '" sizes="512x512" type="image/png">' . "\n"
            . '<link rel="icon" href="' . $esc(poznoteCustomLogoUrl(192, $base)) . '" sizes="192x192" type="image/png">' . "\n"
            . '<link rel="apple-touch-icon" href="' . $esc(poznoteCustomLogoUrl(512, $base)) . '">' . "\n";
    }
    $appleTouch = $base . 'pwa/poznote.png' . ($assetVersion !== '' ? '?v=' . $assetVersion : '');
    return '<link rel="icon" href="' . $esc($base . 'favicon.ico') . '" sizes="512x512" type="image/png">' . "\n"
        . '<link rel="icon" href="' . $esc($base . 'favicon.svg') . '" type="image/svg+xml">' . "\n"
        . '<link rel="apple-touch-icon" href="' . $esc($appleTouch) . '">' . "\n";
}

function poznoteRenderBrandIcons(string $base = '', string $assetVersion = ''): void {
    echo poznoteBrandIconTags($base, $assetVersion);
}

/**
 * The manifest to link: the shipped file, or pwa/manifest.php when the
 * installed app has to take the custom icon.
 */
function poznoteManifestHref(string $defaultHref, string $base = ''): string {
    if (!poznoteHasCustomLogo()) {
        return $defaultHref;
    }
    return $base . 'pwa/manifest.php?v=' . rawurlencode(poznoteCustomLogoVersion());
}

/**
 * The manifest with the custom icons in place of Poznote's. Everything else is
 * kept, the name first. The icon paths are relative to pwa/, like the file's.
 */
function poznoteManifestWithCustomLogo(array $manifest): array {
    if (!poznoteHasCustomLogo()) {
        return $manifest;
    }
    $manifest['icons'] = [];
    foreach (array_reverse(POZNOTE_LOGO_SIZES) as $size) {
        $manifest['icons'][] = [
            'src' => poznoteCustomLogoUrl($size, '../'),
            'sizes' => $size . 'x' . $size,
            'type' => 'image/png',
            'purpose' => 'any',
        ];
    }
    return $manifest;
}

/**
 * The logo in a page. Poznote's is a CSS mask painted with the accent colour
 * (css/components/logo.css); a custom one keeps its own colours, so it is
 * drawn as an image instead.
 *
 * $label: the accessible name, or null for a logo that sits next to its own
 * text (the rail's home link).
 */
function poznoteLogoMark(string $extraClasses = '', ?string $label = null, string $base = ''): string {
    $esc = static function (string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    };
    $classes = trim('poznote-logo ' . $extraClasses);
    $style = '';
    if (poznoteHasCustomLogo()) {
        $classes .= ' poznote-logo-custom';
        $style = ' style="background-image: url(&quot;' . $esc(poznoteCustomLogoUrl(512, $base)) . '&quot;)"';
    }
    $a11y = $label === null
        ? ' aria-hidden="true"'
        : ' role="img" aria-label="' . $esc($label) . '"';
    return '<span class="' . $esc($classes) . '"' . $a11y . $style . '></span>';
}

/**
 * Icon of a reminder notification, relative to the app root. Read afresh: the
 * reminder worker that asks runs for days.
 */
function poznoteNotificationIconPath(): string {
    return poznoteCustomLogoVersion(true) !== '' ? poznoteCustomLogoUrl(192) : 'pwa/poznote-192.png';
}

/**
 * True when $path holds a PNG of exactly $size x $size pixels, small enough to
 * be a logo. The browser draws the files, but the request can come from
 * anywhere: getimagesize() reads the header itself (no GD needed), and the
 * signature check refuses anything that only claims to be a PNG.
 */
function poznoteLogoFileIsValid(string $path, int $size): bool {
    if (!in_array($size, POZNOTE_LOGO_SIZES, true) || !is_file($path)) {
        return false;
    }
    $bytes = filesize($path);
    if ($bytes === false || $bytes <= 0 || $bytes > POZNOTE_LOGO_MAX_BYTES) {
        return false;
    }
    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        return false;
    }
    $signature = fread($handle, 8);
    fclose($handle);
    if ($signature !== "\x89PNG\r\n\x1a\n") {
        return false;
    }
    $info = @getimagesize($path);
    return is_array($info)
        && ($info[2] ?? null) === IMAGETYPE_PNG
        && (int)$info[0] === $size
        && (int)$info[1] === $size;
}

/**
 * Store a new logo from one file per size ($files: size => path of a checked
 * PNG). Each file is written next to its final name and renamed over it, and
 * the 512 one goes last: until then the pages keep the previous logo whole.
 */
function poznoteStoreCustomLogo(array $files): bool {
    foreach (POZNOTE_LOGO_SIZES as $size) {
        if (!isset($files[$size]) || !poznoteLogoFileIsValid((string)$files[$size], $size)) {
            return false;
        }
    }
    $dir = poznoteBrandingDir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        return false;
    }
    foreach (array_reverse(POZNOTE_LOGO_SIZES) as $size) {
        $target = poznoteLogoPath($size);
        $temporary = $target . '.tmp';
        if (!@copy((string)$files[$size], $temporary)) {
            @unlink($temporary);
            return false;
        }
        @chmod($temporary, 0644);
        if (!@rename($temporary, $target)) {
            @unlink($temporary);
            return false;
        }
    }
    poznoteCustomLogoVersion(true);
    return true;
}

/** Back to Poznote's logo. */
function poznoteRemoveCustomLogo(): bool {
    $removed = true;
    foreach (POZNOTE_LOGO_SIZES as $size) {
        $path = poznoteLogoPath($size);
        if (is_file($path) && !@unlink($path)) {
            $removed = false;
        }
    }
    poznoteCustomLogoVersion(true);
    return $removed;
}
