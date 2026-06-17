/**
 * Excalidraw Editor Theme Initialization
 * Must run in <head> to prevent flash of unstyled content
 */
(function() {
    'use strict';

    function normalizeThemeMode(theme) {
        theme = String(theme || '').toLowerCase();
        return theme === 'black' || theme === 'dark' || theme === 'light' || theme === 'system'
            ? theme
            : null;
    }

    function getSystemTheme() {
        return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }

    function getThemeBackground(theme, effectiveTheme) {
        if (theme === 'black') {
            return '#141821';
        }
        return effectiveTheme === 'dark' ? '#252526' : '#ffffff';
    }

    function getCanvasBackground(theme, effectiveTheme) {
        if (theme === 'black') {
            return '#f2f7ff';
        }
        return effectiveTheme === 'dark' ? '#e9e9ea' : '#ffffff';
    }

    function applyBodyThemeClasses(theme, effectiveTheme) {
        if (!document.body) {
            return;
        }

        var background = getThemeBackground(theme, effectiveTheme);
        var canvasBackground = getCanvasBackground(theme, effectiveTheme);
        document.body.classList.toggle('dark-mode', effectiveTheme === 'dark');
        document.body.classList.toggle('black-mode', theme === 'black');
        document.body.style.setProperty('--excalidraw-note-background', background);
        document.body.style.setProperty('--excalidraw-canvas-background', canvasBackground);

        if (document.body.classList.contains('excalidraw-editor-page')) {
            document.body.style.backgroundColor = background;
        }
    }
    
    try {
        var theme = normalizeThemeMode(window.__poznoteForcedTheme)
            || normalizeThemeMode(localStorage.getItem('poznote-theme'))
            || 'system';
        if (theme === 'system') {
            theme = getSystemTheme();
        }
        var effectiveTheme = theme === 'black' ? 'dark' : theme;
        var background = getThemeBackground(theme, effectiveTheme);
        var canvasBackground = getCanvasBackground(theme, effectiveTheme);
        document.documentElement.setAttribute('data-theme', effectiveTheme === 'dark' ? 'dark' : 'light');
        document.documentElement.classList.toggle('theme-black', theme === 'black');
        document.documentElement.style.setProperty('--excalidraw-note-background', background);
        document.documentElement.style.setProperty('--excalidraw-canvas-background', canvasBackground);
        document.documentElement.style.backgroundColor = background;
        document.documentElement.style.colorScheme = effectiveTheme === 'dark' ? 'dark' : 'light';

        applyBodyThemeClasses(theme, effectiveTheme);
        document.addEventListener('DOMContentLoaded', function() {
            applyBodyThemeClasses(theme, effectiveTheme);
        });
    } catch (e) {
        // Fallback silently
    }
})();
