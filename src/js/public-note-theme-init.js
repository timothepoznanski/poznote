/**
 * Public Note Theme Initialization
 * Must run in <head> to prevent flash of unstyled content
 * Reads initial theme from JSON config element
 */
(function() {
    'use strict';

    var STORAGE_KEY = 'poznote-public-theme';

    function normalizeTheme(theme) {
        theme = String(theme || '').toLowerCase();
        return theme === 'dark' || theme === 'light' || theme === 'black' ? theme : null;
    }

    function getStoredTheme() {
        try {
            return normalizeTheme(localStorage.getItem(STORAGE_KEY));
        } catch (e) {
            return null;
        }
    }

    function getServerTheme() {
        var configEl = document.getElementById('public-note-config');
        var config = configEl ? JSON.parse(configEl.textContent || '{}') : {};
        var htmlTheme = document.documentElement.getAttribute('data-theme');

        return normalizeTheme(config.serverTheme)
            || (document.documentElement.classList.contains('theme-black') ? 'black' : null)
            || normalizeTheme(htmlTheme)
            || 'light';
    }

    function applyTheme(theme) {
        var effectiveTheme = theme === 'black' ? 'dark' : theme;
        var isDark = effectiveTheme === 'dark';
        var background = theme === 'black' ? '#141821' : '#252526';

        var root = document.documentElement;
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        root.style.colorScheme = isDark ? 'dark' : 'light';
        root.style.backgroundColor = isDark ? background : '#ffffff';
        root.classList.toggle('theme-black', theme === 'black');
    }

    try {
        applyTheme(getStoredTheme() || getServerTheme());
    } catch (e) {
        // Fallback silently
    }
})();
