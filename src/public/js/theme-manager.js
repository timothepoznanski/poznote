/**
 * Theme Manager for Poznote
 * Handles light, dark, black, and system mode switching
 */

(function () {
    'use strict';

    // Per-user storage (defined in theme-init.js); falls back to the shared
    // localStorage keys on pages loaded without theme-init.js.
    var themeStore = window.__poznoteUserStorage || window.localStorage;

    var palettes = {
        dark: {
            contentBg: '#252526',
            sidebarBg: '#252526',
            text: '#e0e0e0'
        },
        black: {
            contentBg: '#141821',
            sidebarBg: '#0b0d12',
            text: '#d8dee8'
        }
    };

    // The three themes the Theme card in settings.php offers, in the order the
    // toggle buttons walk through them. 'system' is not a theme of its own: it
    // resolves to whichever of light/dark the OS is on, so the cycle starts
    // from what is actually displayed.
    var THEME_CYCLE = ['light', 'dark', 'black'];

    // Each toggle button shows the theme its next click applies.
    var THEME_ICONS = {
        light: 'lucide-sun',
        dark: 'lucide-moon',
        black: 'lucide-moon-star'
    };

    function getNextTheme(theme) {
        // An unknown value lands on 'light', the first entry of the cycle.
        return THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    }

    function normalizeThemeMode(theme) {
        theme = String(theme || '').toLowerCase();
        return theme === 'black' || theme === 'dark' || theme === 'light' || theme === 'system'
            ? theme
            : null;
    }

    function getEffectiveTheme(theme) {
        return theme === 'black' || theme === 'dark' ? 'dark' : 'light';
    }

    function getPalette(theme) {
        return theme === 'black' ? palettes.black : palettes.dark;
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
        var palette = getPalette(selectedTheme);

        // Set data-theme on <html> for early CSS
        root.setAttribute('data-theme', effectiveTheme);
        root.style.colorScheme = effectiveTheme;
        root.style.backgroundColor = effectiveTheme === 'dark' ? palette.contentBg : '#ffffff';

        // Update theme-dark/theme-light classes for consistency with theme-init.js
        if (effectiveTheme === 'dark') {
            root.classList.add('theme-dark');
            root.classList.remove('theme-light');
        } else {
            root.classList.add('theme-light');
            root.classList.remove('theme-dark');
        }
        root.classList.toggle('theme-black', selectedTheme === 'black');

        // Remove critical CSS from theme-init.js if it exists, as it contains !important rules
        // that will interfere with dynamic theme switching
        var criticalStyle = document.getElementById('theme-init-critical-css');
        if (criticalStyle) {
            criticalStyle.remove();
        }

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

    // Point the toggle buttons at the theme the next click applies, from the
    // SELECTED mode (light, dark, black or system).
    function updateThemeUI(mode) {
        // Toggle buttons show the theme a click would switch to. Taken from the
        // selected mode rather than the effective one, which collapses black
        // into dark and would leave two of the three steps on the same icon.
        var appliedTheme = mode === 'system' ? getSystemTheme() : mode;
        var toggleIconClass = 'lucide ' + THEME_ICONS[getNextTheme(appliedTheme)];
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

    document.addEventListener('click', function (event) {
        var target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        var themeToggle = target.closest('[data-theme-toggle]');
        if (!themeToggle) return;

        event.preventDefault();
        toggleTheme();
    });

    // Initialize theme when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
})();
