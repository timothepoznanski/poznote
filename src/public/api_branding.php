<?php
/**
 * The instance logo (discussion #1336), see lib/branding.php.
 *
 *   GET                              whether a custom logo is set, and its URL
 *   POST logo_512=<png> logo_192=<png>  store a custom logo
 *   DELETE                           back to Poznote's logo
 *
 * The browser sends the two PNG files already drawn at their size, from any
 * image the admin picked: nothing is resized here.
 */
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/api-response.php';
requireAdmin();

require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../lib/branding.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');

function brandingRespondWithState(): void
{
    $custom = poznoteHasCustomLogo();
    // Relative to the app root, for the Settings page to swap the logo in place
    apiSuccess([
        'custom' => $custom,
        'url' => $custom ? poznoteCustomLogoUrl(512) : '',
        'icon_url' => $custom ? poznoteCustomLogoUrl(192) : '',
        'manifest_url' => poznoteManifestHref('pwa/manifest.webmanifest'),
    ]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    brandingRespondWithState();
    exit;
}

if ($method === 'POST') {
    $files = [];
    foreach (POZNOTE_LOGO_SIZES as $size) {
        $file = $_FILES['logo_' . $size] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
            || !is_uploaded_file((string)($file['tmp_name'] ?? ''))) {
            apiFail('Both logo sizes are required.', 400);
            exit;
        }
        if (!poznoteLogoFileIsValid((string)$file['tmp_name'], $size)) {
            apiFail('Invalid logo file.', 400);
            exit;
        }
        $files[$size] = (string)$file['tmp_name'];
    }

    if (!createDirectoryWithPermissions(poznoteBrandingDir()) || !poznoteStoreCustomLogo($files)) {
        apiFail('Failed to save the logo.', 500);
        exit;
    }
    brandingRespondWithState();
    exit;
}

if ($method === 'DELETE') {
    if (!poznoteRemoveCustomLogo()) {
        apiFail('Failed to remove the logo.', 500);
        exit;
    }
    brandingRespondWithState();
    exit;
}

apiFail('Invalid request method', 405);
