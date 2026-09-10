// Per-user localStorage wrapper so display preferences (theme, font sizes,
// icon scale) don't leak between accounts sharing the same browser.
// The user id comes from the poznote_uid cookie set by auth.php; without it
// (login page, public pages) the legacy shared keys are used as before.
// On first read for a given user, the legacy shared value is migrated to the
// user-scoped key so existing preferences are kept.
window.__poznoteUserId = (function () {
    try {
        var match = document.cookie.match(/(?:^|;\s*)poznote_uid=(\d+)/);
        return match ? match[1] : '';
    } catch (e) {
        return '';
    }
})();

window.__poznoteUserStorage = window.__poznoteUserStorage || (function () {
    var uid = window.__poznoteUserId;

    function scopedKey(key) {
        return uid ? key + '::u' + uid : key;
    }

    return {
        getItem: function (key) {
            try {
                var value = localStorage.getItem(scopedKey(key));
                if (value === null && uid) {
                    var legacy = localStorage.getItem(key);
                    if (legacy !== null) {
                        localStorage.setItem(scopedKey(key), legacy);
                        return legacy;
                    }
                }
                return value;
            } catch (e) {
                return null;
            }
        },
        setItem: function (key, value) {
            try { localStorage.setItem(scopedKey(key), value); } catch (e) {
                console.debug('theme-init: scopedKey() failed:', e);
            }
        },
        removeItem: function (key) {
            try { localStorage.removeItem(scopedKey(key)); } catch (e) {
                console.debug('theme-init: scopedKey() failed:', e);
            }
        }
    };
})();

// The theme is a per-user display preference like the others, but the pages
// that need it first are pre-auth: logout clears the poznote_uid cookie, so
// login.php has no user to read the scoped key for and used to fall back to
// 'system' whatever theme the account had chosen. Every write therefore also
// lands on an unscoped device key, which the pre-auth pages read back. Only a
// theme name travels that way, so nothing about the account leaks to the next
// person using the browser.
window.__poznoteThemeStorage = window.__poznoteThemeStorage || (function () {
    var KEY = 'poznote-theme';
    var DEVICE_KEY = 'poznote-theme-device';

    return {
        get: function () {
            if (window.__poznoteUserId) {
                var scoped = window.__poznoteUserStorage.getItem(KEY);
                // Backfill: a browser that chose its theme before the mirror
                // existed would otherwise keep a pre-auth page on 'system'
                // until the user picked a theme again.
                if (scoped) {
                    try {
                        if (localStorage.getItem(DEVICE_KEY) !== scoped) {
                            localStorage.setItem(DEVICE_KEY, scoped);
                        }
                    } catch (e) {
                        console.debug('theme-init: device theme mirror failed:', e);
                    }
                }
                return scoped;
            }
            try {
                // The legacy shared key is the fallback for browsers that last
                // set a theme before the preferences were scoped per user.
                return localStorage.getItem(DEVICE_KEY) || localStorage.getItem(KEY);
            } catch (e) {
                return null;
            }
        },
        set: function (value) {
            window.__poznoteUserStorage.setItem(KEY, value);
            try { localStorage.setItem(DEVICE_KEY, value); } catch (e) {
                console.debug('theme-init: device theme mirror failed:', e);
            }
        }
    };
})();

// Open tabs are stored per user and per workspace. Unlike the display
// preferences above there is no migration from the legacy shared key: adopting
// the tabs of whoever used the browser before is exactly the leak this scoping
// prevents, since a tab title exposes another account's note. Tabs left under
// the legacy key are dropped once so they cannot resurface later.
window.__poznoteTabsStorageKey = function (workspace) {
    var key = 'poznote_tabs_' + (workspace || 'default');
    return window.__poznoteUserId ? key + '::u' + window.__poznoteUserId : key;
};

(function purgeLegacyTabKeys() {
    if (!window.__poznoteUserId) return;

    try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
            var key = localStorage.key(i);
            if (key && key.indexOf('poznote_tabs_') === 0 && key.indexOf('::u') === -1) {
                localStorage.removeItem(key);
            }
        }
    } catch (e) {
        console.debug('theme-init: purgeLegacyTabKeys() failed:', e);
    }
})();

// Drop everything this browser holds for a user id, so deleting an account
// does not leave its tabs and display preferences behind for the next account.
window.__poznoteClearUserStorage = function (userId) {
    var suffix = '::u' + (userId || window.__poznoteUserId);
    if (suffix === '::u') return;

    try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
            var key = localStorage.key(i);
            if (key && key.length > suffix.length && key.indexOf(suffix, key.length - suffix.length) !== -1) {
                localStorage.removeItem(key);
            }
        }
    } catch (e) {
        console.debug('theme-init: purgeLegacyTabKeys() failed:', e);
    }
};

// Theme initialization - runs synchronously in <head> to prevent FOUC
(function () {
    try {
        // Every theme, with just enough of each palette to paint the page
        // before the stylesheets land. `mode` goes in data-theme, `variant` is
        // the class carrying the palette. The same list lives in
        // js/theme-manager.js and css/tokens.css: add a theme in all three.
        var THEMES = {
            light:    { mode: 'light', contentBg: '#ffffff', sidebarBg: '#ffffff', text: '#333333' },
            dark:     { mode: 'dark',  contentBg: '#252526', sidebarBg: '#252526', text: '#e0e0e0' },
            black:    { mode: 'dark',  contentBg: '#141821', sidebarBg: '#0b0d12', text: '#d8dee8', variant: 'theme-black' },
            lavender: { mode: 'light', contentBg: '#f3e3ff', sidebarBg: '#e7cdfb', text: '#1a0033', variant: 'theme-lavender' },
            sepia:    { mode: 'light', contentBg: '#f6ecd8', sidebarBg: '#efe0c4', text: '#3b2c1a', variant: 'theme-sepia' },
            terminal: { mode: 'dark',  contentBg: '#041008', sidebarBg: '#000000', text: '#4ee87a', variant: 'theme-terminal' }
        };

        var VARIANT_CLASSES = ['theme-black', 'theme-lavender', 'theme-sepia', 'theme-terminal'];

        // A stylesheet uploaded in Settings > Custom CSS can be offered as a
        // theme of its own. Those entries only exist in the list the server
        // injects at the top of the head (window.__poznoteThemeList), so an id
        // like 'custom:catppuccin.css' is only a theme while the admin keeps it
        // in the list: an unknown one falls back to 'system' like any other
        // stale value.
        function findCustomTheme(value) {
            var list = window.__poznoteThemeList;
            if (!list || !list.length) return null;
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].id === value && list[i].file) return list[i];
            }
            return null;
        }

        function themeList() {
            var list = window.__poznoteThemeList;
            return list && list.length ? list : [];
        }

        function findListed(value) {
            var list = themeList();
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].id === value) return list[i];
            }
            return null;
        }

        function getSystemTheme() {
            return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }

        // 'system' means light or dark. When the admin left neither in the
        // list, the first theme of the same mode stands in, then the first one.
        function resolveSystemTheme() {
            var system = getSystemTheme();
            var list = themeList();
            if (!list.length || findListed(system)) return system;
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].mode === system) return list[i].id;
            }
            return list[0].id;
        }

        // The theme a stored value means today. When the admin curated the
        // list, only what is in it counts: a theme taken out of it resolves to
        // the first one offered, so the page follows the list right away
        // instead of keeping a theme nobody can pick any more.
        function resolveStoredTheme(value) {
            value = String(value || '');
            var lower = value.toLowerCase();
            if (value === '' || lower === 'system') return resolveSystemTheme();

            var list = themeList();
            if (!list.length) return THEMES[lower] ? lower : resolveSystemTheme();
            if (findListed(value)) return value;
            if (findListed(lower)) return lower;
            return list[0].id;
        }

        // A page that forces a theme is a public one: it names a built-in
        // theme, and the curated list has no say there.
        function forcedTheme() {
            var value = String(window.__poznoteForcedTheme || '').toLowerCase();
            return value !== 'system' && THEMES[value] ? value : null;
        }

        window.__poznoteResolveThemeId = resolveStoredTheme;

        // The theme on screen right now, custom ids included: what the page is
        // painted with before theme-manager.js is even loaded.
        function currentThemeId() {
            return forcedTheme() || resolveStoredTheme(window.__poznoteThemeStorage.get());
        }

        window.__poznoteCurrentThemeId = currentThemeId;

        // Point the single custom stylesheet link (injected by config.php right
        // before </head>) at the theme in use: the file of a custom theme, or
        // the instance-wide stylesheet an admin applied to everyone. Called
        // from the head while it is still parsing, and again by
        // theme-manager.js on every theme change.
        window.__poznoteApplyCustomTheme = function (themeId) {
            var link = document.getElementById('poznote-custom-css');
            if (!link) return;

            var custom = findCustomTheme(themeId || currentThemeId());
            var href = custom ? custom.href : (link.getAttribute('data-poznote-default-href') || '');
            if (href) {
                if (link.getAttribute('href') !== href) link.setAttribute('href', href);
            } else if (link.hasAttribute('href')) {
                link.removeAttribute('href');
            }
        };

        var t = currentThemeId();
        var customTheme = findCustomTheme(t);
        // A custom stylesheet brings its own colours, so the flash-prevention
        // palette is the plain light or dark one it sits on.
        var palette = customTheme ? THEMES[customTheme.mode === 'dark' ? 'dark' : 'light'] : (THEMES[t] || THEMES.light);
        var effectiveTheme = palette.mode;
        var isDark = effectiveTheme === 'dark';
        var r = document.documentElement;
        r.setAttribute('data-theme', effectiveTheme);
        r.style.colorScheme = effectiveTheme;
        // Painted inline so the page is not white for a frame. theme-manager.js
        // removes it once the stylesheets are in, so a theme can own the canvas.
        r.style.backgroundColor = palette.contentBg;

        // One variant class at a time, in both modes: the named themes are
        // variants of light or dark, exactly as theme-black always was.
        var activeVariant = customTheme ? '' : palette.variant;
        for (var vi = 0; vi < VARIANT_CLASSES.length; vi++) {
            if (VARIANT_CLASSES[vi] === activeVariant) {
                r.classList.add(VARIANT_CLASSES[vi]);
            } else {
                r.classList.remove(VARIANT_CLASSES[vi]);
            }
        }

        // Add theme class for pages that need it (settings, display)
        if (isDark) {
            r.classList.add('theme-dark');
            r.classList.remove('theme-light');

            // Inject critical CSS to prevent white flash on all key elements
            var style = document.createElement('style');
            style.id = 'theme-init-critical-css';
            style.textContent = [
                'body { background-color: ' + palette.contentBg + ' !important; color: ' + palette.text + ' !important; }',
                '#left_col { background-color: ' + palette.sidebarBg + ' !important; }',
                '#right_col, #right_pane { background-color: ' + palette.contentBg + ' !important; }',
                '.note-header { background-color: ' + palette.contentBg + ' !important; }',
                '.note-edit-toolbar { background-color: ' + palette.contentBg + ' !important; }',
                '.note-header-spacer { background-color: ' + palette.contentBg + ' !important; }',
                '.notecard { background-color: ' + palette.contentBg + ' !important; }',
                '.innernote { background-color: ' + palette.contentBg + ' !important; color: ' + palette.text + ' !important; }',
                '.css-title { background-color: ' + palette.contentBg + ' !important; color: ' + palette.text + ' !important; }'
            ].join(' ');
            document.head.appendChild(style);
        } else {
            r.classList.add('theme-light');
            r.classList.remove('theme-dark');
        }
    } catch (e) {
        // Fallback silently if localStorage unavailable
        console.debug('theme-init: getSystemTheme() failed:', e);
    }
})();

// Main app font - runs synchronously in <head> to avoid a font flash.
// Every stylesheet references the 'Inter' family by name (often with
// !important), so the font is swapped globally by re-declaring the 'Inter'
// @font-face with local system fonts instead of touching font-family rules.
// The <style> element is appended to <html> (not <head>), so it always sits
// after the stylesheet <link>s in document order and wins the @font-face
// cascade, even though this script runs before the links are parsed.
(function () {
    // local() matches exact family or PostScript names only (no fontconfig
    // aliasing), so each stack lists Windows/macOS names plus their
    // metric-compatible Linux equivalents (Liberation, Arimo/Tinos/Gelasio,
    // DejaVu).
    var FONTS = {
        system: {
            regular: ['Segoe UI', 'Roboto', 'Helvetica Neue', 'Ubuntu', 'Cantarell', 'Noto Sans', 'Liberation Sans', 'DejaVu Sans', 'Arial'],
            semibold: ['Segoe UI Semibold', 'SegoeUI-SemiBold', 'Roboto Medium', 'Roboto-Medium', 'HelveticaNeue-Medium', 'Ubuntu Medium', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Ubuntu', 'Cantarell', 'Noto Sans', 'Liberation Sans', 'DejaVu Sans', 'Arial']
        },
        arial: {
            regular: ['Arial', 'ArialMT', 'Helvetica', 'Liberation Sans', 'Arimo'],
            semibold: ['Arial Bold', 'Arial-BoldMT', 'Helvetica Bold', 'Liberation Sans Bold', 'Arimo Bold', 'Arial', 'Liberation Sans', 'Arimo']
        },
        verdana: {
            regular: ['Verdana', 'DejaVu Sans'],
            semibold: ['Verdana Bold', 'Verdana-Bold', 'DejaVu Sans Bold', 'Verdana', 'DejaVu Sans']
        },
        trebuchet: {
            regular: ['Trebuchet MS', 'TrebuchetMS'],
            semibold: ['Trebuchet MS Bold', 'TrebuchetMS-Bold', 'Trebuchet MS']
        },
        georgia: {
            regular: ['Georgia', 'Gelasio', 'DejaVu Serif'],
            semibold: ['Georgia Bold', 'Georgia-Bold', 'Gelasio Bold', 'DejaVu Serif Bold', 'Georgia', 'Gelasio', 'DejaVu Serif']
        },
        times: {
            regular: ['Times New Roman', 'TimesNewRomanPSMT', 'Liberation Serif', 'Tinos'],
            semibold: ['Times New Roman Bold', 'TimesNewRomanPS-BoldMT', 'Liberation Serif Bold', 'Tinos Bold', 'Times New Roman', 'Liberation Serif', 'Tinos']
        }
    };

    function localSrc(names) {
        var parts = [];
        for (var i = 0; i < names.length; i++) {
            parts.push("local('" + names[i] + "')");
        }
        return parts.join(', ');
    }

    function applyMainFont(fontKey) {
        var existing = document.getElementById('main-font-override');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
        var def = FONTS[fontKey];
        if (!def) return; // 'inter' or unknown value -> bundled Inter

        var style = document.createElement('style');
        style.id = 'main-font-override';
        style.textContent =
            // The regular face answers 300 as well as 400: css/fonts.css bundles a
            // real Inter Light, and without this range a page asking for 300
            // would keep drawing that Light while its neighbours switch to the
            // chosen font. System stacks have no Light to offer, so the chosen
            // font's regular stands in and the page stays one family.
            "@font-face { font-family: 'Inter'; src: " + localSrc(def.regular) + "; font-weight: 300 400; font-style: normal; } " +
            "@font-face { font-family: 'Inter'; src: " + localSrc(def.semibold) + "; font-weight: 600; font-style: normal; }";
        document.documentElement.appendChild(style);
    }

    window.__poznoteApplyMainFont = applyMainFont;
    window.__poznoteMainFonts = FONTS;

    try {
        applyMainFont(window.__poznoteUserStorage.getItem('main_font'));
    } catch (e) {
        // Fallback silently if localStorage unavailable
        console.debug('theme-init: applyMainFont() failed:', e);
    }
})();

// Markdown editor font - runs synchronously in <head> to avoid a font flash.
// Only the editing view (the CodeMirror instance) is affected, the rendered
// preview keeps the app font. Unlike the app font above, this targets a
// specific selector instead of the 'Inter' @font-face, because the editor
// font must change without touching the rest of the interface.
// Default ('inherit') keeps the app font, which is what the editor shows
// today: noteentry.css forces 'Inter' with !important on every element inside
// a note, so the plain .cm-editor rule in markdown.css never takes effect.
(function () {
    // Each stack lists the Windows/macOS names plus common Linux equivalents,
    // then a generic family as a last resort. These go into a font-family
    // declaration (not local()), so generic names like monospace work.
    // There is no entry for 'inherit': it is the default and means "no
    // override", which is what the editor already shows today.
    var EDITOR_FONTS = {
        courier: "'Courier New', Courier, monospace",
        consolas: "Consolas, 'Liberation Mono', 'DejaVu Sans Mono', monospace",
        menlo: "Menlo, 'DejaVu Sans Mono', monospace",
        monaco: "Monaco, 'DejaVu Sans Mono', monospace",
        jetbrains: "'JetBrains Mono', 'DejaVu Sans Mono', monospace",
        cascadia: "'Cascadia Code', 'Cascadia Mono', 'DejaVu Sans Mono', monospace",
        fira: "'Fira Code', 'Fira Mono', 'DejaVu Sans Mono', monospace",
        sourcecodepro: "'Source Code Pro', 'DejaVu Sans Mono', monospace",
        ubuntumono: "'Ubuntu Mono', 'DejaVu Sans Mono', monospace",
        monospace: "monospace"
    };

    function applyEditorFont(fontKey) {
        var existing = document.getElementById('markdown-font-override');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
        var stack = EDITOR_FONTS[fontKey];
        if (!stack) return; // 'inherit' or unknown value -> app font

        // noteentry.css forces 'Inter' with !important on nearly every element
        // inside a note, including the editor's own divs. The :is() list plus
        // the repeated id raises specificity above that rule so this wins.
        var style = document.createElement('style');
        style.id = 'markdown-font-override';
        style.textContent =
            '.markdown-codemirror-host :is(.cm-editor, .cm-scroller, .cm-content, .cm-line, .cm-line *, ' +
            '#markdown-font#markdown-font#markdown-font) { font-family: ' + stack + ' !important; }';
        document.documentElement.appendChild(style);
    }

    window.__poznoteApplyEditorFont = applyEditorFont;
    window.__poznoteEditorFonts = EDITOR_FONTS;

    try {
        applyEditorFont(window.__poznoteUserStorage.getItem('markdown_font'));
    } catch (e) {
        // Fallback silently if localStorage unavailable
        console.debug('theme-init: applyEditorFont() failed:', e);
    }
})();
