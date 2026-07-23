/**
 * Excalidraw Editor Theme Initialization
 * Must run in <head> to prevent flash of unstyled content
 */

// Same per-user storage wrapper as theme-init.js (this page does not load it).
window.__poznoteUserStorage = window.__poznoteUserStorage || (function () {
    var uid = '';
    try {
        var match = document.cookie.match(/(?:^|;\s*)poznote_uid=(\d+)/);
        if (match) uid = match[1];
    } catch (e) {}

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
            try { localStorage.setItem(scopedKey(key), value); } catch (e) {}
        },
        removeItem: function (key) {
            try { localStorage.removeItem(scopedKey(key)); } catch (e) {}
        }
    };
})();

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
            || normalizeThemeMode(window.__poznoteUserStorage.getItem('poznote-theme'))
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
