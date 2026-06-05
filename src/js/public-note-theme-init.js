/**
 * Public Note Theme Initialization
 * Must run in <head> to prevent flash of unstyled content
 * Reads initial theme from JSON config element
 */
(function() {
    'use strict';
    
    try {
        // Get server-provided theme from config
        var configEl = document.getElementById('public-note-config');
        var config = configEl ? JSON.parse(configEl.textContent || '{}') : {};
        var theme = config.serverTheme || 'light';
        var effectiveTheme = theme === 'black' ? 'dark' : theme;
        var isDark = effectiveTheme === 'dark';
        var background = theme === 'black' ? '#141821' : '#252526';
        
        var root = document.documentElement;
        root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        root.style.colorScheme = isDark ? 'dark' : 'light';
        root.style.backgroundColor = isDark ? background : '#ffffff';
        root.classList.toggle('theme-black', theme === 'black');
    } catch (e) {
        // Fallback silently
    }
})();
