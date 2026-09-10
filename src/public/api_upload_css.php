<?php
/**
 * The custom CSS library.
 *
 * Uploading used to replace whatever was there: the previous file was deleted
 * and the new one became the stylesheet. Trying a second theme meant losing the
 * first one and re-uploading it to come back. The files are now kept side by
 * side in data/css/ and `custom_css_path` only says which one is active, so an
 * admin uploads a theme once and switches between them afterwards.
 *
 *   GET                         list the stored themes and the active one
 *   POST css_file=<upload>      store a theme (and make it active)
 *   POST action=select          activate a stored theme, or none
 *   POST action=theme_list      set what the rail's theme button walks through
 *   DELETE ?filename=<name>     remove one theme (defaults to the active one)
 */
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/api-response.php';
requireAdmin();

require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../theme_catalog.php';

header('Content-Type: application/json');

$css_dir = __DIR__ . '/../data/css';

if (!createDirectoryWithPermissions($css_dir)) {
    apiFail('Failed to create css directory', 500);
    exit;
}

/** A stored theme is a plain .css file name, no directory part. */
function customCssNameIsValid($filename)
{
    return poznoteCustomCssNameIsValid($filename);
}

function customCssUrl($filename, $path)
{
    return '/data/css/' . rawurlencode($filename) . '?v=' . filemtime($path);
}

/** Every theme in data/css/, ordered by name so the list stays stable. */
function customCssList($css_dir)
{
    $themes = [];
    foreach (poznoteCustomCssFiles() as $filename => $path) {
        $themes[] = [
            'filename' => $filename,
            'size' => filesize($path),
            'modified' => filemtime($path),
            'url' => customCssUrl($filename, $path),
        ];
    }
    return $themes;
}

/**
 * The active theme, or '' when the setting points at a file that is gone.
 */
function customCssActive($css_dir)
{
    $filename = getGlobalSetting('custom_css_path', '');
    if (customCssNameIsValid($filename) && is_file($css_dir . '/' . $filename)) {
        return $filename;
    }
    return '';
}

function customCssRespondWithState($css_dir, array $extra = [])
{
    $active = customCssActive($css_dir);
    $payload = [
        'success' => true,
        'themes' => customCssList($css_dir),
        'active' => $active,
        // Kept for the older callers that only knew about a single file.
        'exists' => $active !== '',
        'filename' => $active,
    ];
    if ($active !== '') {
        $payload['url'] = customCssUrl($active, $css_dir . '/' . $active);
    }

    // What the rail's theme button walks through, and everything the modal
    // needs to render the choice: the built-in themes are defined in PHP so the
    // page does not have to keep its own copy of the list.
    $payload['theme_list'] = [
        'configured' => poznoteThemeListIsConfigured(),
        'entries' => poznoteThemeList(),
    ];
    $payload['builtin_themes'] = poznoteBuiltinThemes();
    $payload['custom_theme_icon'] = poznoteCustomThemeIcon();

    echo json_encode(array_merge($payload, $extra));
}

// Handle GET - list the stored themes and say which one is applied
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    customCssRespondWithState($css_dir);
    exit;
}

// Handle POST action=theme_list - set what the rail's theme button walks through
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'theme_list') {
    $entries = json_decode((string) ($_POST['entries'] ?? ''), true);
    if (!is_array($entries)) {
        apiFail('Invalid theme list', 400);
        exit;
    }

    $normalized = poznoteNormalizeThemeList($entries);
    if ($normalized === []) {
        // An empty list would leave the button with nothing to walk through,
        // and an empty setting already means "not configured".
        apiFail('Keep at least one theme in the list', 400);
        exit;
    }

    setGlobalSetting('theme_list', json_encode($normalized));
    poznoteResetThemeListCache();
    customCssRespondWithState($css_dir);
    exit;
}

// Handle POST action=select - apply a stored theme, or none at all
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'select') {
    $filename = trim((string) ($_POST['filename'] ?? ''));

    if ($filename === '') {
        setGlobalSetting('custom_css_path', '');
        customCssRespondWithState($css_dir);
        exit;
    }

    if (!customCssNameIsValid($filename)) {
        apiFail('Invalid file name', 400);
        exit;
    }

    if (!is_file($css_dir . '/' . $filename)) {
        apiFail('This CSS file is not stored on this instance', 404);
        exit;
    }

    setGlobalSetting('custom_css_path', $filename);
    customCssRespondWithState($css_dir);
    exit;
}

// Handle POST - upload a CSS file
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['css_file'])) {
    $file = $_FILES['css_file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        apiFail('Upload failed with error code: ' . $file['error'], 400);
        exit;
    }

    $max_size = 1 * 1024 * 1024; // 1 MB
    if ($file['size'] > $max_size) {
        apiFail('File too large. Maximum size is 1 MB.', 413);
        exit;
    }

    // Validate MIME type (not just extension, read the first bytes)
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    $allowed_mimes = ['text/css', 'text/plain', 'application/octet-stream'];
    if (!in_array($mime, $allowed_mimes, true)) {
        apiFail('Invalid file type. Only CSS files are allowed.', 400);
        exit;
    }

    // Sanitize filename: keep the original name if valid, otherwise use custom.css.
    // A long name is truncated rather than replaced by custom.css: with several
    // themes stored, that fallback would overwrite an unrelated one.
    $original = pathinfo($file['name'], PATHINFO_FILENAME);
    $original = preg_replace('/[^A-Za-z0-9._-]/', '_', $original);
    if (strlen($original) > 60) {
        $original = substr($original, 0, 60);
    }
    $filename = ($original !== '' ? $original : 'custom') . '.css';

    $destination = $css_dir . '/' . $filename;

    // Uploading the same name updates that theme; the other ones are kept.
    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        apiFail('Failed to save file', 500);
        exit;
    }

    // A freshly uploaded theme becomes the active one, as before.
    if (($_POST['activate'] ?? '1') !== '0') {
        setGlobalSetting('custom_css_path', $filename);
    }

    customCssRespondWithState($css_dir, ['uploaded' => $filename]);
    exit;
}

// Handle DELETE - remove one stored theme (the active one when unspecified)
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $requested = trim((string) ($_GET['filename'] ?? ''));
    $active = getGlobalSetting('custom_css_path', '');
    $filename = $requested !== '' ? $requested : $active;

    if ($requested !== '' && !customCssNameIsValid($requested)) {
        apiFail('Invalid file name', 400);
        exit;
    }

    if (customCssNameIsValid($filename)) {
        $path = $css_dir . '/' . $filename;
        if (is_file($path)) {
            @unlink($path);
        }
    }

    // Deleting the applied theme falls back to the built-in appearance.
    if ($filename === $active) {
        setGlobalSetting('custom_css_path', '');
    }

    // The theme that loaded this file goes with it. Normalising drops the
    // entries whose stylesheet is gone; storing the result keeps the setting
    // from carrying a theme nobody can reach.
    if (trim((string) getGlobalSetting('theme_list', '')) !== '') {
        poznoteResetThemeListCache();
        setGlobalSetting('theme_list', json_encode(poznoteStoredThemeList()));
        poznoteResetThemeListCache();
    }

    customCssRespondWithState($css_dir);
    exit;
}

apiFail('Invalid request', 400);
