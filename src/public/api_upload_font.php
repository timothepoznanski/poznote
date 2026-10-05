<?php
/**
 * The custom font library (discussion #1562).
 *
 * An admin uploads font files, they are kept in data/fonts/, and every user
 * can then pick the families they form in the App font and Markdown editor
 * font lists. See font_catalog.php for how files become families.
 *
 *   GET                          list the stored families
 *   POST font_files[]=<upload>   store one or several font files
 *   DELETE ?family=<id>          remove every file of a family
 */
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/api-response.php';
requireAdmin();

require_once __DIR__ . '/../functions.php';
require_once __DIR__ . '/../users/db_master.php';
require_once __DIR__ . '/../font_catalog.php';

header('Content-Type: application/json');

$fonts_dir = poznoteCustomFontsDir();

if (!createDirectoryWithPermissions($fonts_dir)) {
    apiFail('Failed to create fonts directory', 500);
    exit;
}

// A variable font covering several scripts weighs a few megabytes.
const CUSTOM_FONT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The library is read again on every call, so files dropped straight into the
 * data volume are picked up by opening the modal.
 */
function customFontsRespondWithState(string $fonts_dir, array $extra = [])
{
    $fonts = [];
    foreach (poznoteRefreshCustomFonts() as $family) {
        $size = 0;
        foreach ($family['files'] as $filename) {
            $size += (int) @filesize($fonts_dir . '/' . $filename);
        }
        $fonts[] = [
            'id' => $family['id'],
            'name' => $family['name'],
            'files' => $family['files'],
            'size' => $size,
            'faces' => array_map(function ($face) {
                return ['label' => $face['label'], 'style' => $face['style']];
            }, $family['faces']),
        ];
    }

    echo json_encode(array_merge([
        'success' => true,
        'fonts' => $fonts,
        'max_size' => CUSTOM_FONT_MAX_BYTES,
    ], $extra));
}

// Handle GET - list the stored families
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    customFontsRespondWithState($fonts_dir);
    exit;
}

// Handle POST - upload font files
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['font_files'])) {
    $upload = $_FILES['font_files'];
    $names = (array) $upload['name'];
    $tmpNames = (array) $upload['tmp_name'];
    $errors = (array) $upload['error'];
    $sizes = (array) $upload['size'];

    $stored = [];
    $rejected = [];

    foreach ($names as $i => $name) {
        $name = (string) $name;
        if (($errors[$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $rejected[] = ['name' => $name, 'reason' => 'upload'];
            continue;
        }
        if (($sizes[$i] ?? 0) > CUSTOM_FONT_MAX_BYTES) {
            $rejected[] = ['name' => $name, 'reason' => 'size'];
            continue;
        }

        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!isset(poznoteCustomFontFormats()[$extension])) {
            $rejected[] = ['name' => $name, 'reason' => 'type'];
            continue;
        }

        // The extension says what the file claims to be, its first bytes say
        // what it is.
        $head = (string) @file_get_contents($tmpNames[$i], false, null, 0, 4);
        if (!poznoteCustomFontSignatureMatches($extension, $head)) {
            $rejected[] = ['name' => $name, 'reason' => 'type'];
            continue;
        }

        // The name is kept, it is what tells a WOFF2 file's weight and style.
        $base = preg_replace('/[^A-Za-z0-9._-]/', '_', pathinfo($name, PATHINFO_FILENAME));
        $base = trim(substr((string) $base, 0, 80), '.');
        $filename = ($base !== '' ? $base : 'font') . '.' . $extension;

        // Uploading the same name replaces that file; the other ones are kept.
        if (!move_uploaded_file($tmpNames[$i], $fonts_dir . '/' . $filename)) {
            $rejected[] = ['name' => $name, 'reason' => 'upload'];
            continue;
        }
        @chmod($fonts_dir . '/' . $filename, 0644);
        $stored[] = $filename;
    }

    if ($stored === []) {
        $reason = $rejected[0]['reason'] ?? 'upload';
        if ($reason === 'size') {
            apiFail('File too large. Maximum size is 10 MB.', 413);
        } elseif ($reason === 'type') {
            apiFail('Invalid file type. Only WOFF2, WOFF, TTF and OTF fonts are allowed.', 400);
        } else {
            apiFail('Upload failed', 400);
        }
        exit;
    }

    customFontsRespondWithState($fonts_dir, ['uploaded' => $stored, 'rejected' => $rejected]);
    exit;
}

// Handle DELETE - remove every file of one family
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = trim((string) ($_GET['family'] ?? ''));

    foreach (poznoteRefreshCustomFonts() as $family) {
        if ($family['id'] !== $id) {
            continue;
        }
        foreach ($family['files'] as $filename) {
            if (poznoteCustomFontNameIsValid($filename) && is_file($fonts_dir . '/' . $filename)) {
                @unlink($fonts_dir . '/' . $filename);
            }
        }
    }

    // A user who had picked this font goes back to the default one: the
    // browser does not find the id in the catalog any more.
    customFontsRespondWithState($fonts_dir);
    exit;
}

apiFail('Invalid request', 400);
