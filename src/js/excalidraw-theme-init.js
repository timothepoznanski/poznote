/**
 * Excalidraw Editor Theme Initialization
 * Must run in <head> to prevent flash of unstyled content
 */
(function() {
    'use strict';
    
    try {
        var theme = localStorage.getItem('poznote-theme') || 'light';
        if (theme === 'system') {
            theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }
        var effectiveTheme = theme === 'black' ? 'dark' : theme;
        var background = theme === 'black' ? '#141821' : '#252526';
        document.documentElement.setAttribute('data-theme', effectiveTheme === 'dark' ? 'dark' : 'light');
        document.documentElement.classList.toggle('theme-black', theme === 'black');
        document.documentElement.style.backgroundColor = effectiveTheme === 'dark' ? background : '#ffffff';
    } catch (e) {
        // Fallback silently
    }
})();
