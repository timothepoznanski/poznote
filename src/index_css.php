<?php
/**
 * Serves index.php's stylesheets as concatenated CSS bundles.
 *
 * The css/*.css files stay the source of truth (edit them as usual); this
 * endpoint only merges them to avoid ~60 render-blocking requests on
 * index.php. The concatenation order must match the original <link> order.
 *
 * Two bundles are exposed (?group=core|modals) because css/index-mobile.css
 * is media-scoped and must keep its position between the two groups to
 * preserve the CSS cascade.
 *
 * Relative url() references are rewritten so they keep resolving correctly
 * from this endpoint's location (src/ root instead of css/).
 */

$groups = [
    'core' => [
        'css/lucide.css',
        'css/variables.css',
        'css/base.css',
        'css/utilities.css',
        'css/layout.css',
        'css/sidebar.css',
        'css/outline.css',
        'css/toolbar.css',
        'css/menus.css',
        'css/searchbars.css',
        'css/notes/subline.css',
        'css/notes/sidebar.css',
        'css/notes/tags.css',
        'css/notes/attachments-row.css',
        'css/notes/noteentry.css',
        'css/notes/editor.css',
        'css/notes/toolbar.css',
        'css/notes/checkboxes.css',
        'css/code-blocks.css',
        'css/checklists.css',
        'css/folders/headers-toggles.css',
        'css/folders/actions-menu.css',
        'css/folders/content.css',
        'css/folders/selection.css',
        'css/folders/search.css',
        'css/folders/animations.css',
        'css/folders/toolbar-icons.css',
        'css/folders/table-picker.css',
        'css/folders/system-folders.css',
        'css/emoji-picker.css',
        'css/calendar.css',
        'css/table-picker.css',
        'css/slash-commands.css',
        'css/emoji-autocomplete.css',
        'css/drag-drop.css',
        'css/icons.css',
        'css/tabs.css',
        'css/misc.css',
    ],
    'modals' => [
        'css/modal-alerts.css',
        'css/modals/base.css',
        'css/modals/specific-modals.css',
        'css/modals/attachments.css',
        'css/modals/share-modal.css',
        'css/modals/alerts-utilities.css',
        'css/modals/responsive.css',
        'css/modals/snapshot.css',
        'css/modals/reminders.css',
        'css/tasks.css',
        'css/markdown.css',
        'css/excalidraw.css',
        'css/excalidraw-unified.css',
        'css/note-reference.css',
        'css/backlinks.css',
        'css/search-replace.css',
        'css/folder-icon-modal.css',
        'css/kanban.css',
        'css/background-image.css',
        'css/public-workspace-readonly.css',
    ],
];

$group = $_GET['group'] ?? 'core';
if (!isset($groups[$group])) {
    http_response_code(404);
    exit;
}
$files = $groups[$group];

$lastModified = 0;
foreach ($files as $file) {
    $mtime = @filemtime(__DIR__ . '/' . $file);
    if ($mtime !== false) {
        $lastModified = max($lastModified, $mtime);
    }
}

$etag = '"index-css-' . $group . '-' . $lastModified . '"';

header('Content-Type: text/css; charset=UTF-8');
header('Cache-Control: public, max-age=31536000, immutable');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastModified) . ' GMT');
header('ETag: ' . $etag);

if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    exit;
}

/**
 * Rewrite relative url() references so they resolve from src/ instead of the
 * stylesheet's own directory. Absolute URLs, fragments and data: URIs are
 * left untouched.
 */
function poznoteRewriteCssUrls(string $css, string $cssDir): string {
    return preg_replace_callback(
        '/url\(\s*([\'"]?)(?![a-z][a-z0-9+.-]*:|\/|#)([^\'")]+)\1\s*\)/i',
        function ($m) use ($cssDir) {
            $segments = [];
            foreach (explode('/', $cssDir . '/' . $m[2]) as $segment) {
                if ($segment === '' || $segment === '.') {
                    continue;
                }
                if ($segment === '..') {
                    array_pop($segments);
                    continue;
                }
                $segments[] = $segment;
            }
            return "url('" . implode('/', $segments) . "')";
        },
        $css
    ) ?? $css;
}

foreach ($files as $file) {
    $path = __DIR__ . '/' . $file;
    if (!is_file($path)) {
        continue;
    }
    $css = file_get_contents($path);
    if ($css === false) {
        continue;
    }
    echo '/* --- ' . $file . " --- */\n";
    echo poznoteRewriteCssUrls($css, dirname($file));
    echo "\n";
}
