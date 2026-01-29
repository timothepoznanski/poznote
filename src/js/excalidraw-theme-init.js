/**
 * Excalidraw Editor Theme Initialization
 * Must run in <head> to prevent flash of unstyled content
 */
(function() {
    'use strict';
    
    try {
        var theme = localStorage.getItem('poznote-theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.backgroundColor = theme === 'dark' ? '#252526' : '#ffffff';
    } catch (e) {
        // Fallback silently
    }
})();
