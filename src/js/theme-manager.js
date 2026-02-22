/**
 * Theme Manager for Poznote
 * Handles dark mode / light mode / system mode switching
 */

(function () {
    'use strict';

    // Initialize theme on page load
    function initTheme() {
        var savedTheme = localStorage.getItem('poznote-theme');
        var themeToApply = savedTheme;

        if (!savedTheme || savedTheme === 'system') {
            // Use system preference
            themeToApply = getSystemTheme();

            // Listen for system theme changes
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
                // Only re-apply if no manual preference is set
                if (!localStorage.getItem('poznote-theme') || localStorage.getItem('poznote-theme') === 'system') {
                    applyTheme('system', false);
                }
            });
        }

        // Apply theme
        applyTheme(savedTheme || 'system', false);
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
    // theme: 'light', 'dark', or 'system'
    // save: boolean, whether to save to localStorage
    function applyTheme(theme, save) {
        var root = document.documentElement;
        var themeToApply = theme;

        if (theme === 'system') {
            themeToApply = getSystemTheme();
            if (save !== false) {
                localStorage.removeItem('poznote-theme');
            }
        } else if (save !== false) {
            localStorage.setItem('poznote-theme', theme);
        }

        var normalizedTheme = themeToApply === 'dark' ? 'dark' : 'light';

        // Set data-theme on <html> for early CSS
        root.setAttribute('data-theme', normalizedTheme);
        root.style.colorScheme = normalizedTheme;
        root.style.backgroundColor = normalizedTheme === 'dark' ? '#252526' : '#ffffff';

        // Update theme-dark/theme-light classes for consistency with theme-init.js
        if (normalizedTheme === 'dark') {
            root.classList.add('theme-dark');
            root.classList.remove('theme-light');
        } else {
            root.classList.add('theme-light');
            root.classList.remove('theme-dark');
        }

        // Remove critical CSS from theme-init.js if it exists, as it contains !important rules
        // that will interfere with dynamic theme switching
        var criticalStyle = document.getElementById('theme-init-critical-css');
        if (criticalStyle) {
            criticalStyle.remove();
        }

        // Manage body class for compatibility
        if (normalizedTheme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        // Update toggle button/badge if it exists
        // We pass the original theme (light, dark, or system) to update UI correctly
        updateThemeUI(theme);
    }

    // Toggle between light and dark mode (Legacy support for old UI if needed)
    function toggleTheme() {
        var currentTheme = localStorage.getItem('poznote-theme') || 'system';
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
        if (mode === 'light') label = 'light';

        if (badge) {
            var translationKey = 'theme.badge.' + label;
            var fallback = label + ' mode';
            badge.textContent = (window.t ? window.t(translationKey, null, fallback) : fallback);
            badge.className = 'setting-status enabled';
        }

        // Change icon: moon for dark mode, sun for light mode, desktop for system
        if (icon) {
            if (mode === 'dark') {
                icon.className = 'lucide lucide-moon';
            } else if (mode === 'light') {
                icon.className = 'lucide lucide-sun';
            } else {
                icon.className = 'lucide lucide-monitor';
            }
        }
    }

    // When client-side i18n finishes loading, re-render the badge label
    document.addEventListener('poznote:i18n:loaded', function () {
        updateThemeUI(getCurrentThemeMode());
    });

    // Get current theme mode (light, dark, or system)
    function getCurrentThemeMode() {
        return localStorage.getItem('poznote-theme') || 'system';
    }

    // Make functions globally available
    window.toggleTheme = toggleTheme;
    window.getCurrentTheme = function () {
        var mode = getCurrentThemeMode();
        return mode === 'system' ? getSystemTheme() : mode;
    };
    window.getCurrentThemeMode = getCurrentThemeMode;
    window.applyTheme = applyTheme;

    // Initialize theme when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
})();
