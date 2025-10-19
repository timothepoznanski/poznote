/**
 * Theme Manager for Poznote
 * Handles dark mode / light mode switching
 */

(function() {
    'use strict';

    // Initialize theme on page load
    function initTheme() {
        var savedTheme = localStorage.getItem('poznote-theme');
        
        // Default to light mode if no preference saved
        if (!savedTheme) {
            savedTheme = 'light';
        }
        
        applyTheme(savedTheme);
    }

    // Apply theme to body
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        
        // Save preference
        localStorage.setItem('poznote-theme', theme);
        
        // Update toggle button if it exists
        updateToggleButton(theme);
    }

    // Toggle between light and dark mode
    function toggleTheme() {
        var currentTheme = localStorage.getItem('poznote-theme') || 'light';
        var newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        applyTheme(newTheme);
    }

    // Update toggle button appearance
    function updateToggleButton(theme) {
        var badge = document.getElementById('theme-mode-badge');
        if (badge) {
            if (theme === 'dark') {
                badge.textContent = 'dark mode';
                badge.className = 'setting-status enabled';
            } else {
                badge.textContent = 'light mode';
                badge.className = 'setting-status disabled';
            }
        }
    }

    // Get current theme
    function getCurrentTheme() {
        return localStorage.getItem('poznote-theme') || 'light';
    }

    // Make functions globally available
    window.toggleTheme = toggleTheme;
    window.getCurrentTheme = getCurrentTheme;
    window.applyTheme = applyTheme;

    // Initialize theme when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
})();
