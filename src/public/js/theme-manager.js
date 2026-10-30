/**
 * Theme Manager for Poznote
 * Applies a theme and opens the rail button's menu of themes.
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

        // Diagrams are drawn with the theme's colours baked into their SVG.
        if (typeof window.poznoteRefreshMermaidTheme === 'function') {
            window.poznoteRefreshMermaidTheme();
        }
    }

    /**
     * Open the theme list: the last entry of the rail button's menu, and
     * window.toggleTheme when the list holds a single theme.
     *
     * Only an admin can edit that list, so nobody else is sent to it. The modal
     * sits next to the rail for admins (icon_sidebar.php,
     * js/theme-list-modal.js) and opens on the page it is on. A page without
     * the rail (public_folder.php) follows the way to settings.php instead.
     */
    function canEditThemeList() {
        return typeof window.poznoteOpenThemeListModal === 'function';
    }

    function openThemeList() {
        if (canEditThemeList()) {
            window.poznoteOpenThemeListModal();
            return true;
        }
        if (!window.__poznoteThemeListEditable) return false;

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

    // Step to the next theme in the list. Used by public_folder.php through
    // window.toggleTheme, and by the rail button when the account chose it
    // from the button's right-click menu (theme_button_cycle,
    // data-theme-cycle); otherwise the rail button opens a menu (below).
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

    // Show the theme currently in use: the title names it, since the icon of
    // a custom theme is the same for all of them.
    function updateThemeUI(mode) {
        var appliedTheme = getForcedTheme() || resolveTheme(mode);
        var def = getThemeDef(appliedTheme);
        var toggleIconClass = 'lucide ' + ((def && def.icon) || 'lucide-sun');
        var title = label(appliedTheme);
        var toggles = document.querySelectorAll('[data-theme-toggle]');
        for (var i = 0; i < toggles.length; i++) {
            var toggleIcon = toggles[i].querySelector('i');
            if (toggleIcon) {
                // Keep the colour picked for the rail's theme button
                // (js/icon-sidebar-colors.js).
                var colored = toggleIcon.classList.contains('icon-sidebar-icon-colored');
                toggleIcon.className = toggleIconClass + (colored ? ' icon-sidebar-icon-colored' : '');
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

    // ---------------------------------------------------------------------
    // The menu of the rail button.
    //
    // A click opens the list of themes rather than stepping to the next one,
    // and an admin finds the way to the list itself as the last entry. The
    // account can have the click step through the list instead, from the
    // button's right-click menu (theme_button_cycle, data-theme-cycle on the
    // button, setThemeButtonCycles() below). Built
    // here rather than in icon_sidebar.php, with the classes of the rail's
    // overflow menu, so the two read the same (css/icon-sidebar.css).
    var MENU_ID = 'themePickerMenu';
    var MENU_OPEN_CLASS = 'icon-sidebar-overflow-open';
    var menuButton = null;

    function getMenu() {
        var menu = document.getElementById(MENU_ID);
        if (menu) return menu;

        menu = document.createElement('div');
        menu.id = MENU_ID;
        menu.setAttribute('role', 'menu');
        document.body.appendChild(menu);
        return menu;
    }

    function isMenuOpen() {
        var menu = document.getElementById(MENU_ID);
        return !!menu && menu.classList.contains(MENU_OPEN_CLASS);
    }

    function closeMenu(restoreFocus) {
        var menu = document.getElementById(MENU_ID);
        if (menu) menu.classList.remove(MENU_OPEN_CLASS);
        if (menuButton) {
            menuButton.setAttribute('aria-expanded', 'false');
            if (restoreFocus) menuButton.focus();
        }
        menuButton = null;
    }

    function menuItems() {
        var menu = document.getElementById(MENU_ID);
        return menu ? Array.prototype.slice.call(menu.querySelectorAll('.icon-sidebar-overflow-item')) : [];
    }

    // position: fixed, like the overflow menu: the rail scrolls and clips, so
    // an absolutely positioned menu would be cut off. Beside the button, or
    // above it when the button is not on a side of the screen.
    function positionMenu(menu, button) {
        var box = button.getBoundingClientRect();
        var size = menu.getBoundingClientRect();
        var gap = 8;
        var left = box.right + gap;
        if (left + size.width > window.innerWidth - gap) {
            left = Math.max(gap, box.left - size.width - gap);
        }
        var top = Math.min(box.bottom - size.height, window.innerHeight - size.height - gap);
        menu.style.left = Math.round(left) + 'px';
        menu.style.top = Math.round(Math.max(gap, top)) + 'px';
    }

    function menuItem(icon, text) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'icon-sidebar-overflow-item';
        var glyph = document.createElement('i');
        glyph.className = 'lucide ' + icon;
        item.appendChild(glyph);
        var span = document.createElement('span');
        span.textContent = text;
        item.appendChild(span);
        return item;
    }

    function openMenu(button) {
        var menu = getMenu();
        var current = getForcedTheme() || resolveTheme(getCurrentThemeMode());

        menu.innerHTML = '';
        getThemes().forEach(function (def) {
            var item = menuItem(def.icon || 'lucide-sun', label(def.id));
            var checked = def.id === current;
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('data-theme-choice', def.id);
            item.setAttribute('aria-checked', checked ? 'true' : 'false');
            item.classList.toggle('icon-sidebar-overflow-item-active', checked);
            // The icon in the theme's own colour (css/icon-sidebar.css); a
            // custom theme ("custom:file.css") has none
            if (/^[a-z]+$/.test(def.id)) item.classList.add('theme-swatch-' + def.id);
            menu.appendChild(item);
        });

        var separator = document.createElement('div');
        separator.className = 'icon-sidebar-overflow-separator';
        separator.setAttribute('role', 'separator');
        menu.appendChild(separator);

        // Only an admin can edit the list (openThemeList())
        if (canEditThemeList()) {
            var edit = menuItem('lucide-settings', window.t
                ? window.t('common.customize_menu', null, 'Customize this menu')
                : 'Customize this menu');
            edit.setAttribute('role', 'menuitem');
            edit.setAttribute('data-theme-list-edit', '');
            menu.appendChild(edit);
        }

        // How to have the click step through the themes instead (the
        // button's right-click menu, below). From the button: half the pages
        // carrying the rail have no i18n runtime.
        var hintText = button.getAttribute('data-label-menu-hint');
        if (hintText) {
            var hint = document.createElement('div');
            hint.className = 'icon-sidebar-overflow-hint';
            hint.setAttribute('role', 'none');
            hint.textContent = hintText;
            menu.appendChild(hint);
        }

        menuButton = button;
        menu.classList.add(MENU_OPEN_CLASS);
        button.setAttribute('aria-expanded', 'true');
        positionMenu(menu, button);

        var active = menu.querySelector('[aria-checked="true"]') || menuItems()[0];
        if (active) active.focus();
    }

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        var choice = target.closest('[data-theme-choice]');
        if (choice) {
            event.preventDefault();
            applyTheme(choice.getAttribute('data-theme-choice'), true);
            closeMenu(false);
            return;
        }

        if (target.closest('[data-theme-list-edit]')) {
            event.preventDefault();
            closeMenu(false);
            openThemeList();
            return;
        }

        var themeToggle = target.closest('[data-theme-toggle]');
        if (themeToggle && themeToggle.hasAttribute('data-theme-cycle')) {
            event.preventDefault();
            closeMenu(false);
            toggleTheme();
            return;
        }
        if (themeToggle) {
            event.preventDefault();
            var reopen = !isMenuOpen() || menuButton !== themeToggle;
            closeMenu(false);
            if (reopen) openMenu(themeToggle);
            return;
        }

        if (isMenuOpen() && !target.closest('#' + MENU_ID)) {
            closeMenu(false);
        }
    });

    document.addEventListener('keydown', function (event) {
        if (!isMenuOpen()) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu(true);
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        var items = menuItems();
        if (!items.length) return;
        event.preventDefault();
        var index = items.indexOf(document.activeElement);
        var next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        items[(next + items.length) % items.length].focus();
    });

    window.addEventListener('resize', function () {
        if (isMenuOpen()) closeMenu(false);
    });

    // Menu or toggle, switched from the button's right-click menu and saved
    // on the account (theme_button_cycle), applied at once to the buttons of
    // the page
    function setThemeButtonCycles(cycles) {
        var toggles = document.querySelectorAll('[data-theme-toggle]');
        for (var i = 0; i < toggles.length; i++) {
            toggles[i].toggleAttribute('data-theme-cycle', cycles);
            if (cycles) {
                toggles[i].removeAttribute('aria-haspopup');
                toggles[i].removeAttribute('aria-expanded');
            } else {
                toggles[i].setAttribute('aria-haspopup', 'menu');
                toggles[i].setAttribute('aria-expanded', 'false');
            }
        }
        fetch('/api/v1/settings/theme_button_cycle', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ value: cycles ? '1' : '0' })
        }).catch(function (error) {
            console.warn('theme-manager: click mode could not be saved:', error);
        });
    }

    // Its entry in the rail's right-click menu (js/icon-sidebar-colors.js),
    // naming the mode a click on it switches to. The labels come from the
    // button: half the pages carrying the rail have no i18n runtime.
    window.__poznoteIconContextItems = window.__poznoteIconContextItems || {};
    window.__poznoteIconContextItems.iconSidebarThemeToggleBtn = function (button) {
        var cycles = button.hasAttribute('data-theme-cycle');
        return [{
            icon: cycles ? 'lucide-list' : 'lucide-repeat',
            label: button.getAttribute(cycles ? 'data-label-click-menu' : 'data-label-click-cycles')
                || (cycles ? 'Open a menu on click' : 'Toggle on click'),
            run: function () {
                closeMenu(false);
                setThemeButtonCycles(!cycles);
            }
        }];
    };

    // The dictionary loads asynchronously; refresh labels once translations arrive.
    document.addEventListener('poznote:i18n:loaded', function () {
        updateThemeUI(getCurrentThemeMode());
    });

    // Initialize theme when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
})();
