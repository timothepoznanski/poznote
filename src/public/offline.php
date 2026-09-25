<?php
/**
 * Offline page.
 *
 * js/offline-sync.js stores a copy of this page in the browser, and the
 * service worker (sw.js) serves that copy in place of any page of the app
 * the server cannot deliver (no network). It then works from what the
 * browser kept (js/offline-store.js): offline sign-in, the notes modified in
 * the last days, read and edited on the device, sent to the server once the
 * connection is back. js/offline-app.js does all of it.
 *
 * It looks and edits like index.php: same stylesheet bundles, same sidebar
 * and note markup, and the app's own editor modules (the index_js.php head
 * bundle, the selection toolbar, the task list scripts), wired to the device
 * instead of the server.
 *
 * The page carries no account data at all, only the interface in the
 * language asked for (?lang=, the user's language when the app stores it).
 * No auth.php here: whoever fetches it gets the same page.
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/i18n.php';
require_once __DIR__ . '/../lib/note-titles.php';
require_once __DIR__ . '/../version_helper.php';
require_once __DIR__ . '/index_js.php';
require_once __DIR__ . '/index_css.php';

header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'self'; form-action 'self';");
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-cache');

$lang = poznoteNormalizeLanguageCode($_GET['lang'] ?? '')
    ?? poznoteDetectBrowserLanguage((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''), poznoteSupportedLanguages())
    ?? 'en';

$tr = static function (string $key, string $default, array $vars = []) use ($lang): string {
    return t_h($key, $vars, $default, $lang);
};

// The whole dictionary, English under the chosen language: the app modules
// running here translate their own labels (js/offline-boot.js).
$strings = array_replace_recursive(loadI18nDictionary('en'), $lang === 'en' ? [] : loadI18nDictionary($lang));

// Same bundle URLs and version as index.php, so an asset cached for one is
// the asset of the other.
$v = poznoteBuildAssetCacheVersion(getAppVersion());
foreach ([poznoteGetIndexJsAssetVersion(), poznoteGetIndexCssAssetVersion()] as $part) {
    if ($part !== '') {
        $v .= '-' . $part;
    }
}
$v = rawurlencode($v);

$styles = [
    'index_css.php?group=core&v=' . $v,
    'index_css.php?group=modals&v=' . $v,
    'dark_mode_css.php?v=' . $v,
    'css/syntax-highlight.css?v=' . $v,
    // The warning of a sign-out that would lose changes (js/offline-store.js)
    poznoteAsset('css/profile-modal.css'),
    poznoteAsset('css/offline.css'),
];
$mobileStyle = 'css/index-mobile.css?v=' . $v;

$globalsScript = poznoteAsset('js/globals.js');
$scripts = [
    poznoteAsset('js/offline-boot.js'),
    $globalsScript,
    'index_js.php?group=head&v=' . $v,
    'js/codemirror-dist/markdown-codemirror.iife.js?v=' . $v,
    'js/highlight/highlight.min.js?v=' . $v,
    'js/highlight/powershell.min.js?v=' . $v,
    'js/syntax-highlight.js?v=' . $v,
    poznoteAsset('js/events-text-selection.js'),
    poznoteAsset('js/tasklist-core.js'),
    poznoteAsset('js/tasklist-render.js'),
    poznoteAsset('js/tasklist-crud.js'),
    poznoteAsset('js/tasklist-actions.js'),
    poznoteAsset('js/tasklist-edit-modal.js'),
    poznoteAsset('js/tasklist-order-drag.js'),
    // The dialogs of the toolbar (link, videos) and the slash / right-click
    // menu, which leaves out what needs the server on this page
    poznoteAsset('js/ui.js'),
    poznoteAsset('js/date-picker-popup.js'),
    poznoteAsset('js/slash-command.js'),
    // Right-click on an attachment: Open and Download, served from the copy
    // kept on the device (sw.js)
    poznoteAsset('js/note-attachment-menu.js'),
    poznoteAsset('js/offline-store.js'),
    poznoteAsset('js/offline-app.js'),
];
// The app's tab bar, loaded by js/offline-app.js once an account is open:
// its tabs are that account's.
$tabsScript = poznoteAsset('js/tabs.js');

// What the page needs offline, stored next to it by js/offline-sync.js.
// SortableJS is injected by js/tasklist-order-drag.js with the version of
// js/globals.js (window.poznoteAssetUrl); the fonts are reached through the
// stylesheets, which the browser would only ask for once already offline.
$globalsQuery = (string)parse_url($globalsScript, PHP_URL_QUERY);
$assets = array_merge(
    [poznoteAsset('js/theme-init.js'), $mobileStyle],
    $styles,
    $scripts,
    [$tabsScript],
    [
        'js/Sortable.min.js' . ($globalsQuery !== '' ? '?' . $globalsQuery : ''),
        'webfonts/Inter/static/Inter_24pt-Regular.ttf',
        'webfonts/Inter/static/Inter_24pt-SemiBold.ttf',
        'favicon.svg',
    ]
);
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($lang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="color-scheme" content="dark light">
    <title><?php echo $tr('offline.page_title', 'Poznote (offline)'); ?></title>
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
    <script src="<?php echo htmlspecialchars(poznoteAsset('js/theme-init.js'), ENT_QUOTES); ?>"></script>
    <link rel="stylesheet" href="<?php echo htmlspecialchars($styles[0], ENT_QUOTES); ?>">
    <link rel="stylesheet" href="<?php echo htmlspecialchars($mobileStyle, ENT_QUOTES); ?>" media="(max-width: 800px)">
    <?php foreach (array_slice($styles, 1) as $style): ?>
    <link rel="stylesheet" href="<?php echo htmlspecialchars($style, ENT_QUOTES); ?>">
    <?php endforeach; ?>
    <script type="application/json" id="offline-shell-assets"><?php echo json_encode($assets, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP); ?></script>
    <script type="application/json" id="offline-i18n"><?php echo json_encode(['lang' => $lang, 'strings' => $strings, 'defaultNoteTitles' => getDefaultNoteTitles()], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP); ?></script>
    <!-- Read by js/globals.js: no settings API offline -->
    <script type="application/json" id="page-config-data">{"canUseSettingsApi":false,"settings":{"emoji_icons_enabled":"1"}}</script>
</head>
<body class="offline-page" data-markdown-default-mode="preview">

    <!-- Opening, offline sign-in, empty device: over the app until it opens -->
    <div class="offline-screen" id="offline-screen">
        <section id="offline-loading" class="offline-center">
            <span class="poznote-logo offline-logo" role="img" aria-label="Poznote"></span>
        </section>

        <section id="offline-signin" class="offline-center" hidden>
            <div class="offline-card">
                <span class="poznote-logo offline-logo" role="img" aria-label="Poznote"></span>
                <h1 class="offline-card-title">Poznote</h1>
                <p class="offline-muted" id="offline-signin-signed-out" hidden><?php echo $tr('offline.signout.done_text', 'The notes kept offline were removed from this device.'); ?></p>
                <p class="offline-card-intro">
                    <i class="lucide lucide-wifi-off" aria-hidden="true"></i>
                    <span><?php echo $tr('offline.signin.intro', 'You are offline. Sign in to open the notes kept on this device.'); ?></span>
                </p>

                <form id="offline-signin-form" class="offline-signin-form" autocomplete="on" hidden>
                    <input type="text" id="offline-username" name="username" autocomplete="username" required
                           placeholder="<?php echo $tr('offline.signin.username', 'Username or Email'); ?>"
                           aria-label="<?php echo $tr('offline.signin.username', 'Username or Email'); ?>">
                    <input type="password" id="offline-password" name="password" autocomplete="current-password" required
                           placeholder="<?php echo $tr('offline.signin.password', 'Password'); ?>"
                           aria-label="<?php echo $tr('offline.signin.password', 'Password'); ?>">
                    <div class="offline-error" id="offline-signin-error" role="alert" hidden></div>
                    <button type="submit" class="btn btn-primary offline-signin-submit" id="offline-signin-submit"><?php echo $tr('offline.signin.submit', 'Sign in offline'); ?></button>
                </form>

                <div id="offline-continue" class="offline-continue" hidden>
                    <p class="offline-muted"><?php echo $tr('offline.signin.continue_intro', 'You are still signed in on this device, so your recent notes open without a password.'); ?></p>
                    <div id="offline-continue-list" class="offline-continue-list"></div>
                </div>

                <button type="button" class="offline-link-button" id="offline-retry-btn">
                    <i class="lucide lucide-refresh-cw" aria-hidden="true"></i>
                    <span><?php echo $tr('offline.signin.retry', 'Try to reconnect'); ?></span>
                </button>
            </div>
        </section>

        <section id="offline-empty" class="offline-center" hidden>
            <div class="offline-card">
                <span class="poznote-logo offline-logo" role="img" aria-label="Poznote"></span>
                <h1 class="offline-card-title" id="offline-empty-title"><?php echo $tr('offline.empty.title', 'No notes available offline'); ?></h1>
                <p class="offline-card-intro offline-empty-text" id="offline-empty-text"><?php echo $tr('offline.empty.text', 'No notes are kept on this device yet. Connect to the internet and open Poznote once: the notes you modified in the last days will then be available offline.'); ?></p>
                <button type="button" class="btn btn-primary" id="offline-empty-retry-btn"><?php echo $tr('offline.signin.retry', 'Try to reconnect'); ?></button>
            </div>
        </section>
    </div>

    <!-- LEFT COLUMN: same markup as index.php, notes kept offline only -->
    <div id="left_col">
        <div class="sidebar-header">
            <div class="sidebar-title-row">
                <div class="sidebar-title" role="button" tabindex="0" id="offline-workspace-title" aria-haspopup="true" aria-expanded="false">
                    <!-- The connection state, where the app shows the Poznote logo (js/offline-app.js updateStatus) -->
                    <i class="lucide lucide-wifi-off workspace-title-icon offline-title-status" id="offline-status" role="img"
                       title="<?php echo $tr('offline.status.offline', 'Offline'); ?>"
                       aria-label="<?php echo $tr('offline.status.offline', 'Offline'); ?>"></i>
                    <span class="workspace-title-text" id="offline-workspace-name">Poznote</span>
                    <i class="lucide lucide-caret-down workspace-dropdown-icon" id="offline-workspace-caret" hidden></i>
                </div>
                <div class="sidebar-title-actions">
                    <button type="button" class="sidebar-folder-toggle" id="offline-logout-btn"
                            title="<?php echo $tr('workspace_menu.logout', 'Logout'); ?>"
                            aria-label="<?php echo $tr('workspace_menu.logout', 'Logout'); ?>">
                        <i class="lucide lucide-log-out"></i>
                    </button>
                    <button type="button" class="sidebar-plus" id="offline-new-btn" aria-haspopup="true" aria-expanded="false"
                            title="<?php echo $tr('offline.new.button', 'New note'); ?>"
                            aria-label="<?php echo $tr('offline.new.button', 'New note'); ?>">
                        <i class="lucide lucide-plus-circle"></i>
                    </button>
                </div>
                <div class="dropdown-menu offline-workspace-menu" id="offline-workspace-menu" role="menu" hidden></div>
                <div class="dropdown-menu offline-new-menu" id="offline-new-menu" role="menu" hidden>
                    <button type="button" class="dropdown-item" role="menuitem" data-type="note"><i class="lucide lucide-file-text"></i> <?php echo $tr('offline.new.note', 'Note'); ?></button>
                    <button type="button" class="dropdown-item" role="menuitem" data-type="markdown"><i class="lucide lucide-file-code"></i> <?php echo $tr('offline.new.markdown', 'Markdown note'); ?></button>
                    <button type="button" class="dropdown-item" role="menuitem" data-type="tasklist"><i class="lucide lucide-list-todo"></i> <?php echo $tr('offline.new.tasklist', 'Task list'); ?></button>
                </div>
            </div>
        </div>

        <div class="contains_forms_search" id="search-bar-container">
            <div class="unified-search-container">
                <div class="searchbar-row">
                    <div class="searchbar-input-wrapper">
                        <i class="lucide lucide-search offline-search-icon" aria-hidden="true"></i>
                        <input autocomplete="off" autocapitalize="off" spellcheck="false" id="unified-search" type="text"
                               class="search form-control searchbar-input"
                               placeholder="<?php echo $tr('offline.list.search', 'Search notes'); ?>"
                               aria-label="<?php echo $tr('offline.list.search', 'Search notes'); ?>">
                        <!-- As in the app (notes_list.php): only while a search is typed -->
                        <button type="button" class="searchbar-clear" id="offline-search-clear" hidden
                                title="<?php echo $tr('search.clear', 'Clear search'); ?>"
                                aria-label="<?php echo $tr('search.clear', 'Clear search'); ?>"><span class="clear-icon">×</span></button>
                    </div>
                </div>
            </div>
        </div>

        <div class="notes-list-scrollable-content" id="offline-list"></div>
    </div>

    <!-- RIGHT COLUMN -->
    <div id="right_pane" data-tabs-script="<?php echo htmlspecialchars($tabsScript, ENT_QUOTES); ?>">
        <!-- Back online: same banner as the app, over the note toolbar (css/offline-banner.css) -->
        <div class="offline-banner-anchor">
            <div class="offline-banner" id="offline-online-banner" role="status" hidden>
                <i class="lucide lucide-wifi"></i>
                <span class="offline-banner-text" id="offline-online-text"></span>
                <a class="btn btn-primary offline-banner-open" id="offline-online-action" href="index.php"></a>
            </div>
        </div>
        <div id="right_col">
            <div class="offline-placeholder" id="offline-placeholder">
                <i class="lucide lucide-file-text" aria-hidden="true"></i>
                <p><?php echo $tr('offline.note.placeholder', 'Select a note to open it.'); ?></p>
            </div>
            <div class="offline-unavailable" id="offline-unavailable" hidden>
                <i class="lucide lucide-cloud-off" aria-hidden="true"></i>
                <h2 class="offline-unavailable-title" id="offline-unavailable-title"></h2>
                <p class="offline-unavailable-text" id="offline-unavailable-text"></p>
                <button type="button" class="btn btn-secondary offline-back-to-list" id="offline-unavailable-back"><?php echo $tr('offline.note.back', 'Back to the list'); ?></button>
            </div>
            <div id="offline-note-host"></div>
        </div>
    </div>

    <?php foreach ($scripts as $script): ?>
    <script src="<?php echo htmlspecialchars($script, ENT_QUOTES); ?>"></script>
    <?php endforeach; ?>
</body>
</html>
