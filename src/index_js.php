<?php
/**
 * Serves index.php's JavaScript as concatenated bundles.
 *
 * The js/*.js files stay the source of truth (edit them as usual); this
 * endpoint only merges them to avoid ~60 script requests on index.php.
 * The concatenation order must match the original <script> order.
 *
 * Two bundles are exposed:
 *   ?group=head  editor/toolbar modules originally loaded in <head>
 *   ?group=app   application modules originally loaded at the end of <body>
 *
 * Both bundles are loaded with `defer`, so they execute in document order
 * (head before app) after the DOM is parsed. Inline scripts in index.php
 * (poznote-config, DEFAULT_NOTE_TITLES, calendarTranslations, ...) run during
 * parsing, i.e. always before these bundles.
 *
 * Standalone libraries keep their own <script> tags: js/theme-init.js (must
 * run before first paint), pwa/pwa.js, codemirror, lazy-libs, highlight.
 */

$groups = [
    'head' => [
        'js/theme-manager.js',
        'js/modal-alerts.js',
        'js/toolbar.js',
        'js/markdown-formatting.js',
        'js/checklist.js',
        'js/bulletlist.js',
        'js/note-loader-common.js',
        'js/note-reference.js',
        'js/template-selector.js',
        'js/linked-note-selector.js',
        'js/search-replace.js',
        'js/markdown-handler.js',
    ],
    'app' => [
        'js/error-handler.js',
        'js/globals.js',
        'js/workspaces.js',
        'js/notes.js',
        'js/ui.js',
        'js/note-edit-lock.js',
        'js/date-time-format.js',
        'js/attachments.js',
        'js/tags-modal.js',
        'js/events-utils.js',
        'js/events-auto-save.js',
        'js/events-drag-drop.js',
        'js/note-history.js',
        'js/events-navigation.js',
        'js/events-rich-text-editing.js',
        'js/events-text-selection.js',
        'js/utils.js',
        'js/search-highlight.js',
        'js/slash-command.js',
        'js/pwa-helpers.js',
        'js/share.js',
        'js/reminders.js',
        'js/folder-hierarchy.js',
        'js/math-renderer.js',
        'js/modals-events.js',
        'js/index-events.js',
        'js/main.js',
        'js/resize-column.js',
        'js/outline-panel.js',
        'js/unified-search.js',
        'js/clickable-tags.js',
        'js/font-size-settings.js',
        'js/index-icon-scale-settings.js',
        'js/background-settings.js',
        'js/tasklist.js',
        'js/excalidraw.js',
        'js/copy-code-on-focus.js',
        'js/table-context-menu.js',
        'js/table-cell-selection.js',
        'js/system-menu.js',
        'js/notes-list-events.js',
        'js/folder-icon.js',
        'js/kanban.js',
        'js/tabs.js',
        'js/calendar.js',
        'js/backlinks.js',
        'js/snapshots.js',
        'js/ui-customization.js',
    ],
];

$group = $_GET['group'] ?? 'app';
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

$etag = '"index-js-' . $group . '-' . $lastModified . '"';

header('Content-Type: text/javascript; charset=UTF-8');
header('Cache-Control: public, max-age=31536000, immutable');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastModified) . ' GMT');
header('ETag: ' . $etag);

if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    exit;
}

foreach ($files as $file) {
    $path = __DIR__ . '/' . $file;
    if (!is_file($path)) {
        continue;
    }
    $js = file_get_contents($path);
    if ($js === false) {
        continue;
    }
    echo '/* --- ' . $file . " --- */\n";
    echo $js;
    // Statement separator so a file that doesn't end its last statement can't
    // merge with the next file's first expression (e.g. IIFE + leading paren)
    echo "\n;\n";
}
