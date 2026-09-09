/**
 * Theme Manager for Poznote
 * Handles light, dark, black, and system mode switching
 */

(function () {
    'use strict';

    // Per-user storage (defined in theme-init.js); falls back to the shared
    // localStorage keys on pages loaded without theme-init.js.
    var themeStore = window.__poznoteUserStorage || window.localStorage;

    // Every theme the picker offers. `mode` is what goes in data-theme, so the
    // whole stylesheet keeps working unchanged; `variant`, when set, is the
    // class on <html> that carries the palette, mirroring theme-black. The
    // same list lives in js/theme-init.js and in css/tokens.css: a new theme
    // has to be added in all three.
    var THEMES = [
        { id: 'light',    mode: 'light', icon: 'lucide-sun' },
        { id: 'dark',     mode: 'dark',  icon: 'lucide-moon' },
        { id: 'black',    mode: 'dark',  icon: 'lucide-moon-star', variant: 'theme-black' },
        { id: 'lavender', mode: 'light', icon: 'lucide-flower-2', variant: 'theme-lavender' },
        { id: 'sepia',    mode: 'light', icon: 'lucide-book-open', variant: 'theme-sepia' },
        { id: 'terminal', mode: 'dark',  icon: 'lucide-terminal',  variant: 'theme-terminal' }
    ];

    var THEME_VARIANT_CLASSES = THEMES
        .map(function (t) { return t.variant; })
        .filter(Boolean);

    // The three the toggle used to walk through, kept for window.toggleTheme:
    // public_folder.php and the keyboard path still cycle rather than pick.
    var THEME_CYCLE = ['light', 'dark', 'black'];

    var THEME_ICONS = {};
    THEMES.forEach(function (t) { THEME_ICONS[t.id] = t.icon; });

    function getThemeDef(theme) {
        for (var i = 0; i < THEMES.length; i++) {
            if (THEMES[i].id === theme) return THEMES[i];
        }
        return null;
    }

    function getNextTheme(theme) {
        // An unknown value lands on 'light', the first entry of the cycle.
        return THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    }

    function normalizeThemeMode(theme) {
        theme = String(theme || '').toLowerCase();
        return theme === 'system' || getThemeDef(theme) ? theme : null;
    }

    function getEffectiveTheme(theme) {
        var def = getThemeDef(theme);
        return def ? def.mode : 'light';
    }

    function getForcedTheme() {
        var forcedTheme = normalizeThemeMode(window.__poznoteForcedTheme);
        return forcedTheme && forcedTheme !== 'system' ? forcedTheme : null;
    }

    // Initialize theme on page load
    function initTheme() {
        var forcedTheme = getForcedTheme();
        if (forcedTheme) {
            applyTheme(forcedTheme, false);
            return;
        }

        var savedTheme = normalizeThemeMode(themeStore.getItem('poznote-theme')) || 'system';

        if (savedTheme === 'system') {
            // Listen for system theme changes
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
                // Only re-apply if no manual preference is set
                var currentMode = normalizeThemeMode(themeStore.getItem('poznote-theme')) || 'system';
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
    // theme: 'light', 'dark', 'black', or 'system'
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
            selectedTheme = getSystemTheme();
            if (save !== false) {
                // Store 'system' explicitly instead of removing the key, so an
                // absent user-scoped key keeps meaning "not migrated yet".
                themeStore.setItem('poznote-theme', 'system');
            }
        } else if (save !== false) {
            themeStore.setItem('poznote-theme', theme);
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
        var variant = (getThemeDef(selectedTheme) || {}).variant;
        THEME_VARIANT_CLASSES.forEach(function (cls) {
            root.classList.toggle(cls, cls === variant);
        });

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
        // We pass the selected mode (light, dark, black, or system) to update UI correctly
        updateThemeUI(theme);
    }

    // Step to the next theme: light -> dark -> black -> light. Used by the
    // toggle buttons carrying data-theme-toggle and by public_folder.php
    // through window.toggleTheme.
    function toggleTheme() {
        var mode = getCurrentThemeMode();
        var selectedTheme = mode === 'system' ? getSystemTheme() : mode;

        applyTheme(getNextTheme(selectedTheme), true);
    }

    // Show the theme currently in use. It used to show the one the NEXT click
    // would apply, which made sense while the button cycled; it opens a picker
    // now, so the icon reports state instead of predicting an action.
    function updateThemeUI(mode) {
        var appliedTheme = mode === 'system' ? getSystemTheme() : mode;
        var toggleIconClass = 'lucide ' + (THEME_ICONS[appliedTheme] || THEME_ICONS.light);
        var toggles = document.querySelectorAll('[data-theme-toggle]');
        for (var i = 0; i < toggles.length; i++) {
            var toggleIcon = toggles[i].querySelector('i');
            if (toggleIcon) {
                toggleIcon.className = toggleIconClass;
            }
        }
    }

    // Get current theme mode (light, dark, black, or system)
    function getCurrentThemeMode() {
        var forcedTheme = getForcedTheme();
        if (forcedTheme) return forcedTheme;

        return normalizeThemeMode(themeStore.getItem('poznote-theme')) || 'system';
    }

    // Make functions globally available
    window.toggleTheme = toggleTheme;
    window.getCurrentTheme = function () {
        var mode = getCurrentThemeMode();
        var selectedTheme = mode === 'system' ? getSystemTheme() : mode;
        return getEffectiveTheme(selectedTheme);
    };
    window.getCurrentThemeMode = getCurrentThemeMode;
    window.applyTheme = applyTheme;

    // ---------------------------------------------------------------------
    // The picker.
    //
    // The rail button used to cycle light -> dark -> black, which stopped
    // scaling at three themes. It opens this menu instead. The markup and the
    // classes are the rail's overflow menu, so the two read the same and share
    // its stylesheet; it is built here rather than in icon_sidebar.php because
    // the button also exists on pages that do not render the rail.
    var MENU_ID = 'themePickerMenu';
    var MENU_OPEN_CLASS = 'icon-sidebar-overflow-open';

    function label(theme) {
        var fallbacks = {
            light: 'Light', dark: 'Dark', black: 'Black',
            lavender: 'Lavender', sepia: 'Sepia', terminal: 'Terminal'
        };
        return window.t
            ? window.t('theme.names.' + theme, null, fallbacks[theme])
            : fallbacks[theme];
    }

    function getMenu() {
        var menu = document.getElementById(MENU_ID);
        if (menu) return menu;

        menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.setAttribute('role', 'menu');
        document.body.appendChild(menu);
        return menu;
    }

    function closeMenu() {
        var menu = document.getElementById(MENU_ID);
        if (menu) menu.classList.remove(MENU_OPEN_CLASS);
        var toggles = document.querySelectorAll('[data-theme-toggle]');
        for (var i = 0; i < toggles.length; i++) {
            toggles[i].setAttribute('aria-expanded', 'false');
        }
    }

    function isMenuOpen() {
        var menu = document.getElementById(MENU_ID);
        return !!menu && menu.classList.contains(MENU_OPEN_CLASS);
    }

    function positionMenu(menu, button) {
        // position: fixed, like the overflow menu: the rail scrolls and clips,
        // so an absolutely positioned menu would be cut off.
        var box = button.getBoundingClientRect();
        var size = menu.getBoundingClientRect();
        var gap = 8;
        var left = box.right + gap;
        if (left + size.width > window.innerWidth - gap) {
            left = Math.max(gap, box.left - size.width - gap);
        }
        var top = Math.min(
            Math.max(gap, box.top + (box.height / 2) - (size.height / 2)),
            window.innerHeight - size.height - gap
        );
        menu.style.left = Math.round(left) + 'px';
        menu.style.top = Math.round(Math.max(gap, top)) + 'px';
    }

    function openMenu(button) {
        var menu = getMenu();
        // On 'system' nothing in the list matches, which would leave the menu
        // with no mark at all. Show the theme actually on screen instead.
        var mode = getCurrentThemeMode();
        var current = mode === 'system' ? getSystemTheme() : mode;

        menu.innerHTML = '';
        THEMES.forEach(function (def) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'icon-sidebar-overflow-item';
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('data-theme-choice', def.id);
            item.setAttribute('aria-checked', current === def.id ? 'true' : 'false');
            if (current === def.id) {
                item.classList.add('icon-sidebar-overflow-item-active');
            }

            var icon = document.createElement('i');
            icon.className = 'lucide ' + def.icon;
            item.appendChild(icon);

            var text = document.createElement('span');
            text.textContent = label(def.id);
            item.appendChild(text);

            menu.appendChild(item);
        });

        menu.classList.add(MENU_OPEN_CLASS);
        button.setAttribute('aria-expanded', 'true');
        positionMenu(menu, button);
    }

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        var choice = target.closest('[data-theme-choice]');
        if (choice) {
            event.preventDefault();
            applyTheme(choice.getAttribute('data-theme-choice'), true);
            closeMenu();
            return;
        }

        var themeToggle = target.closest('[data-theme-toggle]');
        if (themeToggle) {
            event.preventDefault();
            if (isMenuOpen()) {
                closeMenu();
            } else {
                openMenu(themeToggle);
            }
            return;
        }

        if (isMenuOpen() && !target.closest('#' + MENU_ID)) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && isMenuOpen()) {
            closeMenu();
        }
    });

    window.addEventListener('resize', closeMenu);

    // Initialize theme when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
})();
