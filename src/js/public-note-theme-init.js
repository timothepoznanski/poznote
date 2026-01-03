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
        
        var root = document.documentElement;
        root.setAttribute('data-theme', theme);
        root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
        root.style.backgroundColor = theme === 'dark' ? '#1a1a1a' : '#ffffff';
    } catch (e) {
        // Fallback silently
    }
})();
