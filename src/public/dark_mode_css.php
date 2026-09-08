<?php
/**
 * Serves the dark-mode stylesheets as a single concatenated CSS response.
 *
 * The css/dark-mode/*.css files stay the source of truth (edit them as usual);
 * this endpoint only merges them to avoid 11 render-blocking requests on
 * index.php. The concatenation order must match the original <link> order.
 */

$darkModeDir = __DIR__ . '/css/dark-mode/';
$files = [
    'variables.css',
    'layout.css',
    'menus.css',
    'editor.css',
    'modals.css',
    'components.css',
    'pages.css',
    'markdown.css',
    'kanban.css',
    'icons.css',
    'calendar.css',
];

$lastModified = 0;
foreach ($files as $file) {
    $mtime = @filemtime($darkModeDir . $file);
    if ($mtime !== false) {
        $lastModified = max($lastModified, $mtime);
    }
}

$etag = '"dark-mode-' . $lastModified . '"';

header('Content-Type: text/css; charset=UTF-8');
header('Cache-Control: public, max-age=31536000, immutable');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastModified) . ' GMT');
header('ETag: ' . $etag);

if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    exit;
}

foreach ($files as $file) {
    $path = $darkModeDir . $file;
    if (!is_file($path)) {
        continue;
    }
    echo '/* --- dark-mode/' . $file . " --- */\n";
    readfile($path);
    echo "\n";
}
