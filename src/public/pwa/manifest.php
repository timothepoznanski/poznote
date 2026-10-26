<?php
/**
 * The web app manifest with the custom logo as the installed app's icon
 * (lib/branding.php). Pages only link it while a custom logo is set, and it
 * changes the icons alone: the app is still called Poznote under its icon.
 *
 * Public, like manifest.webmanifest: the login page links it.
 */
require_once __DIR__ . '/../../lib/branding.php';

$manifest = json_decode((string)@file_get_contents(__DIR__ . '/manifest.webmanifest'), true);
if (!is_array($manifest)) {
    http_response_code(500);
    exit;
}

header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache');
echo json_encode(poznoteManifestWithCustomLogo($manifest), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
