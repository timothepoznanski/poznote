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

    // Toggle between light and dark mode (Legacy support for old UI if needed)
    function toggleTheme() {
        var currentTheme = themeStore.getItem('poznote-theme') || 'system';
        var newTheme;

        if (currentTheme === 'system') {
            // If currently system, toggle to the opposite of current system theme
            newTheme = getSystemTheme() === 'light' ? 'dark' : 'light';
        } else {
            newTheme = currentTheme === 'light' ? 'dark' : 'light';
        }

        applyTheme(newTheme, true);
    }

    // Update UI elements (badges, buttons) based on the SELECTED theme mode
    function updateThemeUI(mode) {
        var badge = document.getElementById('theme-mode-badge');
        var icon = document.querySelector('#theme-mode-card .settings-card-icon i');

        var label = 'system';
        if (mode === 'dark') label = 'dark';
        if (mode === 'black') label = 'black';
        if (mode === 'light') label = 'light';

        if (badge) {
            var translationKey = 'theme.badge.' + label;
            var fallback = label + ' mode';
            badge.textContent = (window.t ? window.t(translationKey, null, fallback) : fallback);
            badge.className = 'setting-status enabled';
        }

        // Change icon: moon for dark mode, sun for light mode, desktop for system
        if (icon) {
            if (mode === 'dark' || mode === 'black') {
                icon.className = 'lucide lucide-moon';
            } else if (mode === 'light') {
                icon.className = 'lucide lucide-sun';
            } else {
                icon.className = 'lucide lucide-monitor';
            }
        }

        var publicWorkspaceToggle = document.getElementById('publicWorkspaceThemeToggle');
        if (publicWorkspaceToggle) {
            var appliedTheme = mode === 'system' ? getSystemTheme() : getEffectiveTheme(mode);
            var publicIcon = publicWorkspaceToggle.querySelector('i');
            if (publicIcon) {
                publicIcon.className = appliedTheme === 'dark' ? 'lucide lucide-sun' : 'lucide lucide-moon';
            }
        }
    }

    // When client-side i18n finishes loading, re-render the badge label
    document.addEventListener('poznote:i18n:loaded', function () {
        updateThemeUI(getCurrentThemeMode());
    });

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

        var publicWorkspaceToggle = target.closest('#publicWorkspaceThemeToggle');
        if (!publicWorkspaceToggle) return;

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
