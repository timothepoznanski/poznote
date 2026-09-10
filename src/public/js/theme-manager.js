/**
 * Theme Manager for Poznote
 * Applies a theme and walks the rail button through the list of themes.
 */

(function () {
    'use strict';

    // Per-user storage with a device-wide mirror (defined in theme-init.js), so
    // the pre-auth pages can read the theme back without a user id; falls back
    // to the shared localStorage key on pages loaded without theme-init.js.
    var themeStore = window.__poznoteThemeStorage || {
        get: function () {
            try { return localStorage.getItem('poznote-theme'); } catch (e) { return null; }
        },
        set: function (value) {
            try { localStorage.setItem('poznote-theme', value); } catch (e) {
                console.debug('theme-manager: theme could not be stored:', e);
            }
        }
    };

    // The themes shipped with the app. `mode` is what goes in data-theme, so the
    // whole stylesheet keeps working unchanged; `variant`, when set, is the
    // class on <html> that carries the palette, mirroring theme-black. The
    // same list lives in js/theme-init.js, theme_catalog.php and css/tokens.css:
    // a new theme has to be added in all four.
    var BUILTIN_THEMES = [
        { id: 'light',    mode: 'light', icon: 'lucide-sun' },
        { id: 'dark',     mode: 'dark',  icon: 'lucide-moon' },
        { id: 'black',    mode: 'dark',  icon: 'lucide-moon-star', variant: 'theme-black' },
        { id: 'lavender', mode: 'light', icon: 'lucide-flower-2', variant: 'theme-lavender' },
        { id: 'sepia',    mode: 'light', icon: 'lucide-book-open', variant: 'theme-sepia' },
        { id: 'terminal', mode: 'dark',  icon: 'lucide-terminal',  variant: 'theme-terminal' }
    ];

    var THEME_VARIANT_CLASSES = BUILTIN_THEMES
        .map(function (t) { return t.variant; })
        .filter(Boolean);

    /**
     * What the button walks through.
     *
     * An admin curates it in Settings > Theme list: built-in themes can be left
     * out, reordered, and a stylesheet uploaded in Settings > Custom CSS can be
     * added as a theme of its own.
     * config.php injects the result at the top of the head; without it, the six
     * built-in themes are the list, which is what an untouched instance shows.
     */
    function getThemes() {
        var injected = window.__poznoteThemeList;
        if (Object.prototype.toString.call(injected) === '[object Array]' && injected.length) {
            return injected;
        }
        return BUILTIN_THEMES;
    }

    function findTheme(themes, id) {
        for (var i = 0; i < themes.length; i++) {
            if (themes[i].id === id) return themes[i];
        }
        return null;
    }

    // Only what the list offers is a theme here. A forced theme (public pages)
    // is the exception: it names a built-in theme the list has no say on.
    function getThemeDef(theme) {
        return findTheme(getThemes(), theme) || (theme === getForcedTheme() ? findTheme(BUILTIN_THEMES, theme) : null);
    }

    function getNextTheme(theme) {
        var themes = getThemes();
        // A theme that is not in the list (or none at all) starts the walk over.
        var index = -1;
        for (var i = 0; i < themes.length; i++) {
            if (themes[i].id === theme) { index = i; break; }
        }
        return themes[(index + 1) % themes.length].id;
    }

    // 'system' means light or dark. When the admin left neither in the list,
    // the first theme of the same mode stands in, then the first one.
    function resolveSystemTheme() {
        var system = getSystemTheme();
        var themes = getThemes();
        if (findTheme(themes, system)) return system;
        for (var i = 0; i < themes.length; i++) {
            if (themes[i].mode === system) return themes[i].id;
        }
        return themes[0].id;
    }

    // The theme a value means today: a theme taken out of the list resolves to
    // the first one offered, so an account sitting on it follows the list at
    // once rather than keeping a theme nobody can pick any more. Same rule as
    // theme-init.js, which paints the page before this file is loaded.
    function resolveTheme(value) {
        value = String(value || '');
        var lower = value.toLowerCase();
        if (value === '' || lower === 'system') return resolveSystemTheme();
        if (findTheme(getThemes(), value)) return value;
        if (findTheme(getThemes(), lower)) return lower;
        return getThemes()[0].id;
    }

    // 'system' stays 'system' (it is stored as such); anything else becomes the
    // id actually shown.
    function normalizeThemeMode(theme) {
        theme = String(theme || '');
        if (theme.toLowerCase() === 'system') return 'system';
        return resolveTheme(theme);
    }

    function getEffectiveTheme(theme) {
        var def = getThemeDef(theme);
        return def ? def.mode : 'light';
    }

    function getForcedTheme() {
        var forced = String(window.__poznoteForcedTheme || '').toLowerCase();
        return forced !== 'system' && findTheme(BUILTIN_THEMES, forced) ? forced : null;
    }

    // Initialize theme on page load
    function initTheme() {
        var forcedTheme = getForcedTheme();
        if (forcedTheme) {
            applyTheme(forcedTheme, false);
            return;
        }

        var savedTheme = normalizeThemeMode(themeStore.get()) || 'system';

        if (savedTheme === 'system') {
            // Listen for system theme changes
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
                // Only re-apply if no manual preference is set
                var currentMode = normalizeThemeMode(themeStore.get()) || 'system';
                if (currentMode === 'system') {
                    applyTheme('system', false);
                }
            });
        }

        // Apply theme
        applyTheme(savedTheme, false);
    }

    // Get system theme preference
    function getSystemTheme() {
        try {
            return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        } catch (e) {
            return 'light';
        }
    }

    // Apply theme to document
    // theme: a theme id, or 'system'
    // save: boolean, whether to save to localStorage
    function applyTheme(theme, save) {
        var root = document.documentElement;
        var forcedTheme = getForcedTheme();
        if (forcedTheme) {
            theme = forcedTheme;
            save = false;
        }

        theme = normalizeThemeMode(theme) || 'system';
        var selectedTheme = theme;

        if (theme === 'system') {
            selectedTheme = resolveSystemTheme();
            if (save !== false) {
                // Store 'system' explicitly instead of removing the key, so an
                // absent user-scoped key keeps meaning "not migrated yet".
                themeStore.set('system');
            }
        } else if (save !== false) {
            themeStore.set(theme);
        }

        var effectiveTheme = getEffectiveTheme(selectedTheme);

        // Set data-theme on <html> for early CSS
        root.setAttribute('data-theme', effectiveTheme);
        root.style.colorScheme = effectiveTheme;

        // Update theme-dark/theme-light classes for consistency with theme-init.js
        if (effectiveTheme === 'dark') {
            root.classList.add('theme-dark');
            root.classList.remove('theme-light');
        } else {
            root.classList.add('theme-light');
            root.classList.remove('theme-dark');
        }

        // One variant class at a time: the named themes are variants of a mode.
        // A custom theme has none, its stylesheet is the palette.
        var variant = (getThemeDef(selectedTheme) || {}).variant;
        THEME_VARIANT_CLASSES.forEach(function (cls) {
            root.classList.toggle(cls, cls === variant);
        });

        // Point the custom stylesheet link at this theme's file, or back at the
        // one an admin applied instance-wide. Defined in theme-init.js, which
        // already did this once in the head; the pages loaded without it have
        // no per-user theme to apply either.
        if (typeof window.__poznoteApplyCustomTheme === 'function') {
            window.__poznoteApplyCustomTheme(selectedTheme);
        }

        // Remove critical CSS from theme-init.js if it exists, as it contains !important rules
        // that will interfere with dynamic theme switching
        var criticalStyle = document.getElementById('theme-init-critical-css');
        if (criticalStyle) {
            criticalStyle.remove();
        }

        // Same reason, and it was missed: theme-init.js also paints the page
        // canvas inline on <html> to avoid a flash before the stylesheets land.
        // An inline style beats every rule, so leaving it there pins the canvas
        // to that hardcoded value for good, and a custom
        // stylesheet can repaint every panel and still show the old colour
        // behind them (light was pinned to opaque white).
        // By the time this runs the stylesheets are in, so drop it
        // and let html { background-color: var(--pz-bg) } take over.
        root.style.removeProperty('background-color');

        // Manage body class for compatibility
        if (document.body) {
            if (effectiveTheme === 'dark') {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
            document.body.classList.toggle('black-mode', selectedTheme === 'black');
        }

        // Update toggle button/badge if it exists
        // We pass the selected mode (a theme id or 'system') to update UI correctly
        updateThemeUI(theme);
    }

    /**
     * Open the theme list, when the click has nowhere else to go.
     *
     * Only an admin can edit that list, so nobody else is sent to it. The modal
     * lives on settings.php: this opens it in place when already there, and
     * follows the rail's own settings link otherwise, which is the one thing on
     * the page that already knows the way from a subdirectory.
     */
    function openThemeList() {
        if (!window.__poznoteThemeListEditable) return false;

        if (typeof window.poznoteOpenThemeListModal === 'function') {
            window.poznoteOpenThemeListModal();
            return true;
        }

        var settingsLink = document.getElementById('iconSidebarSettingsBtn');
        var href = settingsLink ? (settingsLink.getAttribute('href') || '') : '';
        var target = href ? href.split('#')[0] : 'settings.php';
        try {
            var url = new URL(target, window.location.href);
            url.searchParams.set('open', 'theme-list');
            window.location.href = url.toString();
        } catch (e) {
            window.location.href = 'settings.php?open=theme-list';
        }
        return true;
    }

    // Step to the next theme in the list. Used by the rail button, by the other
    // buttons carrying data-theme-toggle and by public_folder.php through
    // window.toggleTheme.
    function toggleTheme() {
        // One theme means the click has nothing to switch to: it opens the list
        // so an admin can put something in it.
        if (getThemes().length < 2 && openThemeList()) {
            return;
        }

        applyTheme(getNextTheme(resolveTheme(getCurrentThemeMode())), true);
    }

    // The name of a theme: translated for the built-in ones, the file name
    // without its extension for a custom one.
    function label(theme) {
        var def = getThemeDef(theme);
        if (def && def.label) return def.label;

        var fallbacks = {
            light: 'Light', dark: 'Dark', black: 'Black',
            lavender: 'Lavender', sepia: 'Sepia', terminal: 'Terminal'
        };
        return window.t
            ? window.t('theme.names.' + theme, null, fallbacks[theme] || theme)
            : (fallbacks[theme] || theme);
    }

    // Show the theme currently in use. The button walks through the list, so
    // the title names what is applied rather than what the next click brings:
    // the icon of a custom theme is the same for all of them.
    function updateThemeUI(mode) {
        var appliedTheme = getForcedTheme() || resolveTheme(mode);
        var def = getThemeDef(appliedTheme);
        var toggleIconClass = 'lucide ' + ((def && def.icon) || 'lucide-sun');
        var title = label(appliedTheme);
        var toggles = document.querySelectorAll('[data-theme-toggle]');
        for (var i = 0; i < toggles.length; i++) {
            var toggleIcon = toggles[i].querySelector('i');
            if (toggleIcon) {
                toggleIcon.className = toggleIconClass;
            }
            if (title) {
                toggles[i].setAttribute('title', title);
                toggles[i].setAttribute('aria-label', title);
            }
        }
    }

    // Get current theme mode (a theme id, or 'system')
    function getCurrentThemeMode() {
        var forcedTheme = getForcedTheme();
        if (forcedTheme) return forcedTheme;

        return normalizeThemeMode(themeStore.get()) || 'system';
    }

    // Make functions globally available
    window.toggleTheme = toggleTheme;
    window.getCurrentTheme = function () {
        var mode = getCurrentThemeMode();
        return getEffectiveTheme(getForcedTheme() || resolveTheme(mode));
    };
    window.getCurrentThemeMode = getCurrentThemeMode;
    window.applyTheme = applyTheme;
    window.getPoznoteThemes = getThemes;

    // The rail button steps to the next theme on every click. It briefly opened
    // a picker instead, when the list was the six built-in themes and nothing
    // could be taken out of it; the list is curated now, so a click walks it.
    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        var themeToggle = target.closest('[data-theme-toggle]');
        if (themeToggle) {
            event.preventDefault();
            toggleTheme();
        }
    });

    // Initialize theme when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
})();
