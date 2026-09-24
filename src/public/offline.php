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
 * The page carries no account data at all, only the interface in the
 * language asked for (?lang=, the user's language when the app stores it).
 * No auth.php here: whoever fetches it gets the same page.
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/i18n.php';

header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; frame-ancestors 'self'; form-action 'self';");
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-cache');

$lang = poznoteNormalizeLanguageCode($_GET['lang'] ?? '')
    ?? poznoteDetectBrowserLanguage((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''), poznoteSupportedLanguages())
    ?? 'en';

$tr = static function (string $key, string $default, array $vars = []) use ($lang): string {
    return t_h('offline.' . $key, $vars, $default, $lang);
};

// Every string of the offline section, English first so a missing
// translation still reads as text, for js/offline-app.js.
$offlineStrings = array_replace_recursive(
    (array)(loadI18nDictionary('en')['offline'] ?? []),
    (array)(loadI18nDictionary($lang)['offline'] ?? [])
);

$styles = poznoteCssResolve('offline');
$scripts = [
    'js/theme-init.js',
    'js/markdown-source.js',
    'js/markdown-parser.js',
    'js/markdown-merge.js',
    'js/offline-store.js',
    'js/offline-app.js',
];

// What the page needs offline, stored next to it by js/offline-sync.js. The
// fonts are reached through css/fonts.css, which the browser would otherwise
// only request once the page is already offline.
$assets = [];
foreach (array_merge($styles, $scripts) as $file) {
    $assets[] = poznoteAsset($file);
}
foreach (['Light', 'Regular', 'SemiBold'] as $weight) {
    $assets[] = 'webfonts/Inter/static/Inter_24pt-' . $weight . '.ttf';
}
$assets[] = 'favicon.svg';
?>
<!DOCTYPE html>
<html lang="<?php echo htmlspecialchars($lang, ENT_QUOTES); ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="color-scheme" content="dark light">
    <title><?php echo $tr('page_title', 'Poznote (offline)'); ?></title>
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
    <script src="<?php echo htmlspecialchars(poznoteAsset('js/theme-init.js'), ENT_QUOTES); ?>"></script>
    <?php poznoteRenderStylesheets('offline'); ?>
    <script type="application/json" id="offline-shell-assets"><?php echo json_encode($assets, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP); ?></script>
    <script type="application/json" id="offline-i18n"><?php echo json_encode($offlineStrings, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP); ?></script>
</head>
<body class="offline-page">
    <div id="offline-root" class="offline-root">

        <!-- Opening: shown until the page knows what the device holds -->
        <section id="offline-loading" class="offline-center">
            <span class="poznote-logo offline-logo" role="img" aria-label="Poznote"></span>
        </section>

        <!-- Offline sign-in -->
        <section id="offline-signin" class="offline-center" hidden>
            <div class="offline-card">
                <span class="poznote-logo offline-logo" role="img" aria-label="Poznote"></span>
                <h1 class="offline-card-title">Poznote</h1>
                <p class="offline-card-intro">
                    <i class="lucide lucide-wifi-off" aria-hidden="true"></i>
                    <span><?php echo $tr('signin.intro', 'You are offline. Sign in to open the notes kept on this device.'); ?></span>
                </p>

                <form id="offline-signin-form" class="offline-signin-form" autocomplete="on" hidden>
                    <input type="text" id="offline-username" name="username" autocomplete="username" required
                           placeholder="<?php echo $tr('signin.username', 'Username or Email'); ?>"
                           aria-label="<?php echo $tr('signin.username', 'Username or Email'); ?>">
                    <input type="password" id="offline-password" name="password" autocomplete="current-password" required
                           placeholder="<?php echo $tr('signin.password', 'Password'); ?>"
                           aria-label="<?php echo $tr('signin.password', 'Password'); ?>">
                    <div class="offline-error" id="offline-signin-error" role="alert" hidden></div>
                    <button type="submit" class="btn btn-primary offline-signin-submit" id="offline-signin-submit"><?php echo $tr('signin.submit', 'Sign in offline'); ?></button>
                </form>

                <div id="offline-continue" class="offline-continue" hidden>
                    <p class="offline-muted"><?php echo $tr('signin.continue_intro', 'You are still signed in on this device, so your recent notes open without a password.'); ?></p>
                    <div id="offline-continue-list" class="offline-continue-list"></div>
                </div>

                <button type="button" class="offline-link-button" id="offline-retry-btn">
                    <i class="lucide lucide-refresh-cw" aria-hidden="true"></i>
                    <span><?php echo $tr('signin.retry', 'Try to reconnect'); ?></span>
                </button>
            </div>
        </section>

        <!-- Nothing kept on this device, or a browser that cannot keep anything -->
        <section id="offline-empty" class="offline-center" hidden>
            <div class="offline-card">
                <span class="poznote-logo offline-logo" role="img" aria-label="Poznote"></span>
                <h1 class="offline-card-title"><?php echo $tr('empty.title', 'No notes available offline'); ?></h1>
                <p class="offline-card-intro offline-empty-text" id="offline-empty-text"><?php echo $tr('empty.text', 'No notes are kept on this device yet. Connect to the internet and open Poznote once: the notes you modified in the last days will then be available offline.'); ?></p>
                <button type="button" class="btn btn-primary" id="offline-empty-retry-btn"><?php echo $tr('signin.retry', 'Try to reconnect'); ?></button>
            </div>
        </section>

        <!-- The notes -->
        <div id="offline-app" class="offline-app" hidden>
            <header class="offline-topbar">
                <span class="offline-brand">
                    <span class="poznote-logo offline-brand-logo" aria-hidden="true"></span>
                    <span class="offline-brand-name">Poznote</span>
                </span>
                <span class="offline-status" id="offline-status" role="status">
                    <i class="lucide lucide-wifi-off" aria-hidden="true"></i>
                    <span class="offline-status-text"><?php echo $tr('status.offline', 'Offline'); ?></span>
                </span>
                <span class="offline-topbar-spacer"></span>
                <span class="offline-account-name" id="offline-account-name"></span>
                <button type="button" class="offline-icon-button" id="offline-lock-btn"
                        title="<?php echo $tr('lock_hint', 'Lock the offline notes'); ?>"
                        aria-label="<?php echo $tr('lock_hint', 'Lock the offline notes'); ?>">
                    <i class="lucide lucide-lock" aria-hidden="true"></i>
                </button>
            </header>

            <div class="offline-online-banner" id="offline-online-banner" role="status" hidden>
                <i class="lucide lucide-wifi" aria-hidden="true"></i>
                <span class="offline-online-text" id="offline-online-text"></span>
                <a class="btn btn-primary offline-online-action" id="offline-online-action" href="index.php"></a>
            </div>

            <div class="offline-layout">
                <aside class="offline-sidebar">
                    <div class="offline-sidebar-tools">
                        <div class="offline-search-row">
                            <i class="lucide lucide-search" aria-hidden="true"></i>
                            <input type="search" id="offline-search" autocomplete="off"
                                   placeholder="<?php echo $tr('list.search', 'Search notes'); ?>"
                                   aria-label="<?php echo $tr('list.search', 'Search notes'); ?>">
                        </div>
                        <div class="offline-tools-row">
                            <select id="offline-workspace" class="offline-workspace" aria-label="Workspace" hidden></select>
                            <div class="offline-new">
                                <button type="button" class="btn btn-primary offline-new-btn" id="offline-new-btn" aria-haspopup="true" aria-expanded="false">
                                    <i class="lucide lucide-plus" aria-hidden="true"></i>
                                    <span><?php echo $tr('new.button', 'New note'); ?></span>
                                </button>
                                <div class="offline-new-menu" id="offline-new-menu" role="menu" hidden>
                                    <button type="button" role="menuitem" data-type="note"><i class="lucide lucide-file-text" aria-hidden="true"></i><span><?php echo $tr('new.note', 'Note'); ?></span></button>
                                    <button type="button" role="menuitem" data-type="markdown"><i class="lucide lucide-file-code" aria-hidden="true"></i><span><?php echo $tr('new.markdown', 'Markdown note'); ?></span></button>
                                    <button type="button" role="menuitem" data-type="tasklist"><i class="lucide lucide-list-checks" aria-hidden="true"></i><span><?php echo $tr('new.tasklist', 'Task list'); ?></span></button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <nav class="offline-list" id="offline-list" aria-label="<?php echo $tr('list.label', 'Notes'); ?>"></nav>
                </aside>

                <main class="offline-main" id="offline-main">
                    <div class="offline-placeholder" id="offline-placeholder">
                        <i class="lucide lucide-file-text" aria-hidden="true"></i>
                        <p><?php echo $tr('note.placeholder', 'Select a note to open it.'); ?></p>
                    </div>

                    <article class="offline-note" id="offline-note" hidden>
                        <div class="offline-note-header">
                            <button type="button" class="offline-icon-button offline-back-btn" id="offline-back-btn"
                                    title="<?php echo $tr('note.back', 'Back to the list'); ?>"
                                    aria-label="<?php echo $tr('note.back', 'Back to the list'); ?>">
                                <i class="lucide lucide-arrow-left" aria-hidden="true"></i>
                            </button>
                            <input type="text" class="offline-note-title" id="offline-note-title" autocomplete="off"
                                   placeholder="<?php echo $tr('note.title_placeholder', 'Title'); ?>"
                                   aria-label="<?php echo $tr('note.title_placeholder', 'Title'); ?>">
                            <button type="button" class="btn btn-secondary offline-mode-btn" id="offline-mode-btn" hidden></button>
                        </div>
                        <div class="offline-note-meta" id="offline-note-meta"></div>
                        <div class="offline-toolbar" id="offline-html-toolbar" role="toolbar" hidden>
                            <button type="button" data-command="bold" title="<?php echo $tr('toolbar.bold', 'Bold'); ?>" aria-label="<?php echo $tr('toolbar.bold', 'Bold'); ?>"><i class="lucide lucide-bold" aria-hidden="true"></i></button>
                            <button type="button" data-command="italic" title="<?php echo $tr('toolbar.italic', 'Italic'); ?>" aria-label="<?php echo $tr('toolbar.italic', 'Italic'); ?>"><i class="lucide lucide-italic" aria-hidden="true"></i></button>
                            <button type="button" data-command="underline" title="<?php echo $tr('toolbar.underline', 'Underline'); ?>" aria-label="<?php echo $tr('toolbar.underline', 'Underline'); ?>"><i class="lucide lucide-underline" aria-hidden="true"></i></button>
                            <button type="button" data-command="strikeThrough" title="<?php echo $tr('toolbar.strikethrough', 'Strikethrough'); ?>" aria-label="<?php echo $tr('toolbar.strikethrough', 'Strikethrough'); ?>"><i class="lucide lucide-strikethrough" aria-hidden="true"></i></button>
                            <span class="offline-toolbar-separator" aria-hidden="true"></span>
                            <button type="button" data-command="formatBlock" data-value="h2" title="<?php echo $tr('toolbar.heading', 'Heading'); ?>" aria-label="<?php echo $tr('toolbar.heading', 'Heading'); ?>"><i class="lucide lucide-heading" aria-hidden="true"></i></button>
                            <button type="button" data-command="insertUnorderedList" title="<?php echo $tr('toolbar.bullet_list', 'Bulleted list'); ?>" aria-label="<?php echo $tr('toolbar.bullet_list', 'Bulleted list'); ?>"><i class="lucide lucide-list" aria-hidden="true"></i></button>
                            <button type="button" data-command="insertOrderedList" title="<?php echo $tr('toolbar.numbered_list', 'Numbered list'); ?>" aria-label="<?php echo $tr('toolbar.numbered_list', 'Numbered list'); ?>"><i class="lucide lucide-list-ordered" aria-hidden="true"></i></button>
                        </div>
                        <div class="offline-note-body" id="offline-note-body"></div>
                    </article>

                    <div class="offline-unavailable" id="offline-unavailable" hidden>
                        <i class="lucide lucide-cloud-off" aria-hidden="true"></i>
                        <h2 class="offline-unavailable-title" id="offline-unavailable-title"></h2>
                        <p class="offline-unavailable-meta" id="offline-unavailable-meta"></p>
                        <p class="offline-unavailable-text" id="offline-unavailable-text"></p>
                        <button type="button" class="btn btn-secondary offline-back-to-list" id="offline-unavailable-back"><?php echo $tr('note.back', 'Back to the list'); ?></button>
                    </div>
                </main>
            </div>
        </div>
    </div>

    <?php foreach (array_slice($scripts, 1) as $script): ?>
    <script src="<?php echo htmlspecialchars(poznoteAsset($script), ENT_QUOTES); ?>"></script>
    <?php endforeach; ?>
</body>
</html>
